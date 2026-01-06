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
        telegramThreadId?: number;
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
    let messageThreadId: number | undefined;
    let targetChatId: string | number | undefined;
    let projectName = '';

    try {
        // Get initial scan data to extract project name
        const initialScan = await prisma.scan.findUnique({
            where: { id: scanId },
        });

        if (initialScan) {
            projectName = initialScan.sourceName;
        }

        // Create Telegram topic and send start notification IMMEDIATELY
        try {
            const { loadTelegramConfig, getOrCreateForumTopic, sendTelegramMessage } = await import('./telegram');
            const telegramConfig = await loadTelegramConfig();

            if (telegramConfig && telegramConfig.enabled) {
                targetChatId = config.metadata?.telegramChatId || telegramConfig.chatId;

                // Check if we already have a telegramThreadId from rescan
                if (config.metadata?.telegramThreadId) {
                    messageThreadId = config.metadata.telegramThreadId;
                    console.log(`[Worker] Reusing existing Telegram topic: ${messageThreadId}`);
                }
                // Create a topic if the target is a supergroup (chatId usually starts with -100)
                else if (targetChatId.toString().startsWith('-100')) {
                    console.log(`[Worker] Creating Telegram topic for project: ${projectName}...`);
                    const topicResult = await getOrCreateForumTopic(projectName);

                    if (topicResult.success && topicResult.message_thread_id) {
                        messageThreadId = topicResult.message_thread_id;
                        console.log(`[Worker] Topic created: ${messageThreadId}`);

                        // Save Telegram info to scan record immediately
                        await prisma.scan.update({
                            where: { id: scanId },
                            data: {
                                telegramChatId: targetChatId.toString(),
                                telegramThreadId: messageThreadId,
                            },
                        });
                    } else {
                        console.warn('[Worker] ⚠️ Topic creation failed or not a Forum:', topicResult.error);
                    }
                }

                // Send start notification to topic
                if (messageThreadId || targetChatId) {
                    const startMessage = `
🚀 <b>Bắt Đầu Quét Bảo Mật</b>

📁 Dự án: <b>${projectName}</b>
🆔 Scan ID: <code>${scanId}</code>
📅 Thời gian: ${new Date().toLocaleString('vi-VN')}
${config.metadata?.triggeredBy ? `👤 Được kích hoạt bởi: <b>${config.metadata.triggeredBy}</b>` : ''}

⏳ Đang tiến hành phân tích...
                    `.trim();

                    const notifyResult = await sendTelegramMessage(
                        startMessage,
                        messageThreadId,
                        targetChatId
                    );

                    if (notifyResult.success) {
                        console.log('[Worker] ✅ Start notification sent to Telegram topic');
                    } else {
                        console.warn('[Worker] ⚠️ Failed to send start notification:', notifyResult.error);
                    }
                }
            }
        } catch (telegramError) {
            console.warn('[Worker] Telegram start notification error (non-critical):', telegramError);
        }

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
            const { loadTelegramConfig, sendPdfToTelegram } = await import('./telegram');
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

                        // If this is a rescan, fetch old scan data for comparison
                        let comparisonText = '';
                        if (config.compareWithId) {
                            try {
                                const oldScan = await prisma.scan.findUnique({
                                    where: { id: config.compareWithId },
                                });

                                if (oldScan) {
                                    const oldTotal = oldScan.criticalCount + oldScan.highCount + oldScan.mediumCount + oldScan.lowCount + oldScan.infoCount;
                                    const newTotal = totalFindings;
                                    const diff = newTotal - oldTotal;

                                    const criticalDiff = critical - oldScan.criticalCount;
                                    const highDiff = high - oldScan.highCount;
                                    const mediumDiff = medium - oldScan.mediumCount;

                                    const formatDiff = (num: number) => {
                                        if (num > 0) return `🔺 +${num}`;
                                        if (num < 0) return `🔻 ${num}`;
                                        return '➖ 0';
                                    };

                                    comparisonText = `\n\n🔄 <b>So Sánh Quét Lại:</b>\nTổng: ${oldTotal} → ${newTotal} (${formatDiff(diff)})\n⚠️ Nghiêm trọng: ${formatDiff(criticalDiff)}\n🔴 Cao: ${formatDiff(highDiff)}\n🟡 Trung bình: ${formatDiff(mediumDiff)}`;
                                }
                            } catch (err) {
                                console.warn('[Worker] Could not fetch old scan for comparison:', err);
                            }
                        }

                        const caption = `
🔒 <b>Báo Cáo Quét Bảo Mật</b>

📁 Dự án: <b>${pdfData.source.name}</b>
📅 Ngày: ${new Date(pdfData.timestamp).toLocaleString('vi-VN')}
📊 Tổng số lỗi: <b>${totalFindings}</b>

⚠️ Nghiêm trọng: ${critical}
🔴 Cao: ${high}
🟡 Trung bình: ${medium}${comparisonText}

${config.metadata?.triggeredBy ? `👤 Được kích hoạt bởi: <b>${config.metadata.triggeredBy}</b>` : 'Tạo bởi SCA Platform'}
                        `.trim();

                        // Use the topic and chatId created at the start of the scan
                        const finalChatId = targetChatId || config.metadata?.telegramChatId || telegramConfig.chatId;

                        console.log(`[Worker] Sending PDF to topic ${messageThreadId} in chat ${finalChatId}`);

                        const telegramResult = await sendPdfToTelegram(
                            buffer,
                            filename,
                            caption,
                            messageThreadId,
                            finalChatId
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
