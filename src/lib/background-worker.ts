// Background worker script for running scans independently
// This process can be spawned and will continue running even if the parent HTTP request is closed

import { runScan, createTemporaryRepo, cleanupTemp } from './scanner';
import { prisma } from './prisma';

// Parse command line arguments
const args = process.argv.slice(2);
const scanId = args[0];
const configJson = args[1]; // JSON string containing scan configuration

if (!scanId || !configJson) {
    console.error('[Worker] Missing required arguments: scanId and config');
    process.exit(1);
}

interface WorkerConfig {
    method: 'git' | 'folder';
    url?: string;
    folderPath?: string;
    targetPath?: string;
    isTemp?: boolean;
    ruleSet?: string;
    compareWithId?: string;
    metadata?: {
        telegramChatId?: number | string;
        triggeredBy?: string;
        source?: string;
    };
}

let config: WorkerConfig;
try {
    config = JSON.parse(configJson);
} catch (err) {
    console.error('[Worker] Failed to parse config JSON:', err);
    process.exit(1);
}

console.log(`[Worker] Starting background scan: ${scanId}`);
console.log(`[Worker] Config:`, config);

// Progress callback that updates database
async function updateProgress(update: {
    progress: number;
    stage: string;
    details?: string;
    analysis?: any;
    scannedFiles?: number;
    scannedLines?: number;
}) {
    try {
        const updateData: any = {
            lastProgress: update.progress,
            lastStage: update.stage,
            lastDetails: update.details || '',
        };

        if (update.scannedFiles !== undefined) {
            updateData.filesScanned = update.scannedFiles;
        }
        if (update.scannedLines !== undefined) {
            updateData.linesScanned = update.scannedLines;
        }
        if (update.analysis) {
            updateData.analysis = JSON.stringify(update.analysis);
        }

        await prisma.scan.update({
            where: { id: scanId },
            data: updateData,
        });

        console.log(`[Worker] Progress updated: ${update.progress}% - ${update.stage}`);
    } catch (err) {
        console.error('[Worker] Failed to update progress:', err);
    }
}

async function main() {
    const startTime = Date.now();
    let targetPath = config.targetPath || process.cwd();
    let isTemp = config.isTemp || false;

    try {
        // Handle git clone if needed
        if (config.method === 'git' && config.url && !config.targetPath) {
            console.log(`[Worker] Cloning repository: ${config.url}`);
            await updateProgress({
                progress: 10,
                stage: 'Cloning repository...',
                details: config.url,
            });

            targetPath = await createTemporaryRepo(config.url);
            isTemp = true;

            await updateProgress({
                progress: 20,
                stage: 'Repository cloned',
                details: 'Starting analysis',
            });
        } else if (config.method === 'folder' && config.folderPath) {
            targetPath = config.folderPath;
        }

        // Run the actual scan
        console.log(`[Worker] Running scan on: ${targetPath}`);
        await updateProgress({
            progress: 25,
            stage: 'Detecting languages...',
            details: 'Analyzing file types',
        });

        const {
            findings,
            languages,
            scannedLines,
            scannedFiles,
            logs,
            sastCount,
            trivyCount,
            analysis,
            fileTree,
        } = await runScan(
            targetPath,
            {
                ruleSet: config.ruleSet || 'Community (Standard)',
                previousScanId: config.compareWithId,
            },
            updateProgress
        );

        const duration = Math.round((Date.now() - startTime) / 1000);

        // Update scan as completed
        console.log(`[Worker] Scan completed. Found ${findings.length} findings.`);

        await prisma.scan.update({
            where: { id: scanId },
            data: {
                status: 'completed',
                filesScanned: scannedFiles,
                linesScanned: scannedLines,
                duration: duration,
                sastCount: sastCount,
                trivyCount: trivyCount,
                criticalCount: findings.filter((f: any) => f.severity === 'critical').length,
                highCount: findings.filter((f: any) => f.severity === 'high').length,
                mediumCount: findings.filter((f: any) => f.severity === 'medium').length,
                lowCount: findings.filter((f: any) => f.severity === 'low').length,
                infoCount: findings.filter((f: any) => f.severity === 'info').length,
                languages: JSON.stringify(languages),
                logs: logs,
                fileTree: JSON.stringify(fileTree || []),
                analysis: analysis ? JSON.stringify(analysis) : null,
                lastProgress: 100,
                lastStage: 'Complete',
                lastDetails: 'Scan finished successfully',
            },
        });

        // Save findings
        for (const finding of findings) {
            await prisma.finding.create({
                data: {
                    scanId: scanId,
                    fingerprint: finding.fingerprint || `${finding.file}:${finding.line}`,
                    isNew: finding.isNew || false,
                    title: finding.title,
                    severity: finding.severity,
                    file: finding.file,
                    line: finding.line,
                    column: finding.column,
                    message: finding.message,
                    code: finding.code,
                    category: finding.category,
                    cwe: finding.cwe || null,
                    owasp: finding.owasp || null,
                    fix: finding.fix || null,
                },
            });
        }

        // Cleanup temporary files
        if (isTemp) {
            await cleanupTemp(targetPath);
        }

        // Auto-send to Telegram if enabled
        try {
            const { loadTelegramConfig, sendPdfToTelegram, getOrCreateForumTopic } = await import('./telegram');
            const { generateScanPdfBuffer } = await import('./pdf-export');

            const telegramConfig = await loadTelegramConfig();

            if (telegramConfig && telegramConfig.enabled) {
                console.log('[Worker] Telegram notifications enabled, generating PDF...');

                const scanData = await prisma.scan.findUnique({
                    where: { id: scanId },
                    include: { findings: true },
                });

                if (scanData) {
                    const pdfData = {
                        id: scanData.id,
                        timestamp: scanData.timestamp.toISOString(),
                        source: {
                            name: scanData.sourceName,
                            type: scanData.sourceType,
                        },
                        stats: {
                            filesScanned: scanData.filesScanned,
                            linesScanned: scanData.linesScanned,
                            duration: scanData.duration,
                            findings: {
                                critical: scanData.criticalCount,
                                high: scanData.highCount,
                                medium: scanData.mediumCount,
                                low: scanData.lowCount,
                                info: scanData.infoCount,
                            },
                        },
                        findings: scanData.findings,
                    };

                    const pdfResult = generateScanPdfBuffer(pdfData);

                    if (pdfResult) {
                        const { buffer, filename } = pdfResult;

                        const totalFindings = pdfData.findings.length;
                        const critical = pdfData.stats.findings.critical || 0;
                        const high = pdfData.stats.findings.high || 0;
                        const medium = pdfData.stats.findings.medium || 0;

                        const caption = `
🔒 <b>Security Scan Report</b>

📁 Project: <b>${pdfData.source.name}</b>
📅 Date: ${new Date(pdfData.timestamp).toLocaleString()}
📊 Total Findings: <b>${totalFindings}</b>

⚠️ Critical: ${critical}
🔴 High: ${high}
🟡 Medium: ${medium}

${config.metadata?.triggeredBy ? `👤 Triggered by: <b>${config.metadata.triggeredBy}</b>` : 'Generated by SCA Platform'}
                        `.trim();

                        let messageThreadId: number | undefined;

                        // Only try to get topic if we're sending to the default chat
                        if (!config.metadata?.telegramChatId) {
                            const topicResult = await getOrCreateForumTopic(pdfData.source.name);
                            if (topicResult.success) {
                                messageThreadId = topicResult.message_thread_id;
                            }
                        }

                        // Override recipient if metadata provided
                        const targetChatId = config.metadata?.telegramChatId || telegramConfig.chatId;

                        const telegramResult = await sendPdfToTelegram(
                            buffer,
                            filename,
                            caption,
                            messageThreadId,
                            targetChatId
                        );

                        if (telegramResult.success) {
                            console.log('[Worker] ✅ PDF report sent to Telegram successfully');
                        } else {
                            console.warn('[Worker] ⚠️ Failed to send to Telegram:', telegramResult.error);
                        }
                    }
                }
            }
        } catch (telegramError) {
            console.warn('[Worker] Telegram notification error (non-critical):', telegramError);
        }

        console.log(`[Worker] Background scan completed successfully: ${scanId}`);

        // Cleanup worker files
        try {
            const path = await import('path');
            const fs = await import('fs/promises');
            const os = await import('os');
            const tempDir = os.tmpdir();

            // Delete batch file from system temp
            const batchFile = path.join(tempDir, `worker-${scanId}.bat`);
            await fs.unlink(batchFile).catch(() => { });

            // Optionally delete log files after success
            // await fs.unlink(path.join(tempDir, `worker-${scanId}.log`)).catch(() => {});
            // await fs.unlink(path.join(tempDir, `worker-${scanId}.err`)).catch(() => {});
        } catch (cleanupError) {
            console.warn('[Worker] Cleanup error:', cleanupError);
        }

        process.exit(0);
    } catch (error: any) {
        console.error('[Worker] Scan failed:', error);

        // Mark scan as failed in database
        await prisma.scan.update({
            where: { id: scanId },
            data: {
                status: 'failed',
                lastProgress: 0,
                lastStage: 'Error',
                lastDetails: error.message || 'Unknown error',
                logs: `Error: ${error.message}\n${error.stack || ''}`,
            },
        });

        // Cleanup if needed
        if (isTemp && targetPath) {
            await cleanupTemp(targetPath);
        }

        process.exit(1);
    }
}

// Run the worker
main();
