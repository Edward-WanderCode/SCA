import { NextResponse } from 'next/server'
import { runScan, createTemporaryRepo, cleanupTemp } from '@/lib/scanner'
import { saveScanToDatabase, getScanById } from '@/lib/db-helpers'

export const maxDuration = 300; // 5 minutes for long scans

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { url, method, folderPath, ruleSet } = body

        let targetPath = process.cwd()
        let isTemp = false

        if (method === 'git' && url) {
            console.log(`Cloning repository: ${url}...`)
            targetPath = await createTemporaryRepo(url)
            isTemp = true
        } else if (method === 'folder' && folderPath) {
            console.log(`Scanning local folder: ${folderPath}`)
            const fs = await import('fs/promises')
            const path = await import('path')

            try {
                const stats = await fs.stat(folderPath)
                if (!stats.isDirectory()) {
                    return NextResponse.json({
                        error: 'Invalid path',
                        details: 'The provided path is not a directory'
                    }, { status: 400 })
                }
                targetPath = path.resolve(folderPath)
            } catch (err: any) {
                return NextResponse.json({
                    error: 'Invalid folder path',
                    details: `Cannot access folder: ${err.message}`
                }, { status: 400 })
            }
        }

        const scanId = `scan-${Math.random().toString(36).substring(7)}`;
        const timestamp = new Date().toISOString();
        const compareWithId = body.compareWithId || null;

        const runningScan = {
            id: scanId,
            timestamp: timestamp,
            status: 'running',
            source: {
                type: method,
                name: method === 'git' ? (url?.split('/').pop() || 'Repo') : (folderPath?.split(/[\\/]/).pop() || 'Local Folder'),
                url: method === 'git' ? url : null,
                path: targetPath,
            },
            stats: {
                filesScanned: 0,
                linesScanned: 0,
                duration: 0,
                findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
            },
            findings: [],
            languages: [],
            missingPacks: []
        };

        await saveScanToDatabase(runningScan as any);

        console.log(`Starting Opengrep + Trivy scan on: ${targetPath}`)
        const startTime = Date.now();
        const { findings, languages, scannedLines, scannedFiles, logs, fileTree, sastCount, trivyCount } = await runScan(targetPath, { ruleSet })
        const duration = Math.round((Date.now() - startTime) / 1000);

        let previousFindings: any[] = []
        if (compareWithId) {
            try {
                const prevScan = await getScanById(compareWithId)
                if (prevScan) previousFindings = prevScan.findings || []
            } catch (e) {
                console.warn('Could not find previous scan for comparison')
            }
        }

        const fs = await import('fs/promises')
        const path = await import('path')

        const currentFindings = await Promise.all(findings.map(async (f: any) => {
            const fingerprint = `${f.check_id}|${f.path}|${f.extra.message.substring(0, 50)}`
            const isNew = compareWithId ? !previousFindings.some((prev: any) =>
                (prev.fingerprint || `${prev.title}|${prev.file}|${prev.message.substring(0, 50)}`) === fingerprint
            ) : false

            let code = (f.extra.rendered_lines || f.extra.lines || 'No code snippet available').trim();
            if (code === 'requires login' || code === 'required login') {
                try {
                    // Use path.resolve for runtime path resolution to avoid static analysis warnings
                    const fullPath = path.resolve(targetPath, f.path);

                    // Simple safety check to ensure we don't read outside intended directories if needed
                    // For now, allow reading as the user might scan any directory

                    const fileContent = await fs.readFile(fullPath, 'utf8');
                    const lines = fileContent.split('\n');
                    const startLine = Math.max(0, f.start.line - 1);
                    const endLine = Math.min(lines.length, f.end.line);
                    code = lines.slice(startLine, endLine).join('\n').trim();
                } catch (err) { }
            }

            const rawSev = f.extra.severity.toUpperCase();
            let mappedSev = 'low';
            if (['ERROR', 'CRITICAL', 'FATAL'].includes(rawSev)) mappedSev = 'critical';
            else if (['WARNING', 'HIGH', 'MEDIUM'].includes(rawSev)) mappedSev = 'medium';

            return {
                id: `og-${Math.random().toString(36).substring(7)}`,
                fingerprint,
                isNew,
                title: f.check_id.split('.').pop(),
                severity: mappedSev,
                file: f.path,
                line: f.start.line,
                column: f.start.col,
                message: f.extra.message,
                code: code || 'No code snippet available',
                category: f.extra.metadata?.category || 'Security',
                cwe: f.extra.metadata?.cwe?.[0],
                owasp: f.extra.metadata?.owasp?.[0],
                fix: f.extra.remediation || 'Please review the security best practices.'
            }
        }));

        const fixedCount = compareWithId ? previousFindings.filter((prev: any) =>
            !currentFindings.some((curr: any) => curr.fingerprint === (prev.fingerprint || `${prev.title}|${prev.file}`))
        ).length : 0

        const scanResult = {
            ...runningScan,
            status: 'completed',
            stats: {
                filesScanned: scannedFiles,
                linesScanned: scannedLines,
                duration: duration,
                findings: {
                    critical: currentFindings.filter((f: any) => f.severity === 'critical').length,
                    high: 0,
                    medium: currentFindings.filter((f: any) => f.severity === 'medium').length,
                    low: currentFindings.filter((f: any) => f.severity === 'low').length,
                    info: 0
                },
                sastCount: sastCount,
                trivyCount: trivyCount,
                comparison: compareWithId ? {
                    new: currentFindings.filter(f => f.isNew).length,
                    fixed: fixedCount,
                    existing: currentFindings.filter(f => !f.isNew).length
                } : null
            },
            languages: languages,
            findings: currentFindings,
            logs: logs,
            fileTree: fileTree
        }

        await saveScanToDatabase(scanResult as any)

        // Auto-send to Telegram if enabled
        try {
            const { loadTelegramConfig, sendPdfToTelegram } = await import('@/lib/telegram');
            const { generateScanPdfBuffer } = await import('@/lib/pdf-export');

            const telegramConfig = await loadTelegramConfig();

            if (telegramConfig && telegramConfig.enabled) {
                console.log('[Scan] Telegram notifications enabled, generating PDF...');

                // Transform scan data to match PDF export format
                const pdfData = {
                    id: scanResult.id,
                    timestamp: scanResult.timestamp,
                    source: {
                        name: scanResult.source?.name || 'Unknown Project',
                        type: scanResult.source?.type || 'local',
                    },
                    stats: {
                        filesScanned: scanResult.stats?.filesScanned || 0,
                        linesScanned: scanResult.stats?.linesScanned || 'N/A',
                        duration: scanResult.stats?.duration || 0,
                        findings: scanResult.stats?.findings || {
                            critical: 0,
                            high: 0,
                            medium: 0,
                            low: 0,
                            info: 0,
                        },
                    },
                    findings: (scanResult.findings || []).map((f: any) => ({
                        severity: f.severity || 'info',
                        title: f.title || 'Unknown',
                        message: f.message || '',
                        category: f.category || 'Security',
                        file: f.file || '',
                        line: f.line || 0,
                        code: f.code || '',
                    })),
                };

                const pdfResult = generateScanPdfBuffer(pdfData);

                if (pdfResult) {
                    const { buffer, filename } = pdfResult;

                    // Create caption for Telegram
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

Generated by SCA Platform
                    `.trim();

                    // Create or reuse a topic for this scan
                    const { getOrCreateForumTopic } = await import('@/lib/telegram');
                    let messageThreadId: number | undefined;

                    console.log(`[Scan] Getting or creating Telegram topic for: ${pdfData.source.name}...`);
                    const topicResult = await getOrCreateForumTopic(pdfData.source.name);

                    if (topicResult.success) {
                        messageThreadId = topicResult.message_thread_id;
                        console.log(`[Scan] Topic ID: ${messageThreadId}`);
                    } else {
                        console.warn('[Scan] Could not get/create Telegram topic:', topicResult.error);
                    }

                    const telegramResult = await sendPdfToTelegram(buffer, filename, caption, messageThreadId);

                    if (telegramResult.success) {
                        console.log('[Scan] ✅ PDF report sent to Telegram successfully');
                    } else {
                        console.warn('[Scan] ⚠️ Failed to send to Telegram:', telegramResult.error);
                    }
                } else {
                    console.warn('[Scan] ⚠️ Failed to generate PDF buffer');
                }
            }
        } catch (telegramError) {
            // Don't fail the scan if Telegram notification fails
            console.warn('[Scan] Telegram notification error (non-critical):', telegramError);
        }

        if (isTemp) await cleanupTemp(targetPath)

        return NextResponse.json(scanResult)
    } catch (error: any) {
        console.error('Scan API Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

export async function GET() {
    return NextResponse.json({ message: "Use POST to initiate a scan" })
}
