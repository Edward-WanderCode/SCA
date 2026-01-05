import { NextResponse } from 'next/server'
import { runScan, createTemporaryRepo, cleanupTemp } from '@/lib/scanner'
import { saveScanToDatabase } from '@/lib/db-helpers'
import { logger } from '@/lib/logger'

export const maxDuration = 300;

export async function POST(request: Request) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            let scanId = '';
            try {
                console.log('[STREAM] Request received, parsing body...')
                const { url, method, folderPath, ruleSet = 'Community (Standard)' } = await request.json()
                console.log(`[STREAM] Method: ${method}, URL: ${url}, Folder: ${folderPath}`)

                let targetPath = process.cwd()
                let isTemp = false

                // Generate scanId IMMEDIATELY so progress can be tracked
                scanId = `scan-${Math.random().toString(36).substring(7)}`
                console.log(`[STREAM] Generated scanId: ${scanId}`)

                // Send initial progress with scanId
                const initialUpdate = {
                    scanId,
                    progress: 5,
                    stage: 'Initializing scan...',
                    details: 'Setting up environment'
                }
                logger.updateScanProgress(scanId, 5, 'Initializing scan...', 'Setting up environment')
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialUpdate)}\n\n`))

                if (method === 'git' && url) {
                    console.log(`[STREAM] Starting Git clone for: ${url}`)
                    logger.updateScanProgress(scanId, 10, 'Cloning repository...', url)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        scanId,
                        progress: 10,
                        stage: 'Cloning repository...',
                        details: url
                    })}\n\n`))

                    try {
                        targetPath = await createTemporaryRepo(url)
                        isTemp = true
                        console.log(`[STREAM] Clone successful: ${targetPath}`)
                    } catch (cloneError: any) {
                        console.error(`[STREAM] Clone failed:`, cloneError)
                        throw new Error(`Failed to clone repository: ${cloneError.message}`)
                    }

                    logger.updateScanProgress(scanId, 20, 'Repository cloned', 'Starting analysis')
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        scanId,
                        progress: 20,
                        stage: 'Repository cloned',
                        details: 'Starting analysis'
                    })}\n\n`))
                } else if (method === 'folder' && folderPath) {
                    console.log(`[STREAM] Validating folder: ${folderPath}`)
                    const fs = await import('fs/promises')
                    const path = await import('path')

                    try {
                        const stats = await fs.stat(folderPath)
                        if (!stats.isDirectory()) {
                            console.error(`[STREAM] Path is not a directory: ${folderPath}`)
                            logger.updateScanProgress(scanId, 0, 'Error', 'Invalid path: Not a directory')
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                scanId,
                                error: 'Invalid path: Not a directory'
                            })}\n\n`))
                            controller.close()
                            return
                        }
                        targetPath = path.resolve(folderPath)
                        console.log(`[STREAM] Folder validated: ${targetPath}`)

                        logger.updateScanProgress(scanId, 15, 'Scanning local folder', targetPath)
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            scanId,
                            progress: 15,
                            stage: 'Scanning local folder',
                            details: targetPath
                        })}\n\n`))
                    } catch (err: any) {
                        console.error(`[STREAM] Folder access error:`, err)
                        logger.updateScanProgress(scanId, 0, 'Error', `Cannot access folder: ${err.message}`)
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            scanId,
                            error: `Cannot access folder: ${err.message}`
                        })}\n\n`))
                        controller.close()
                        return
                    }
                }

                const timestamp = new Date().toISOString()

                console.log(`[STREAM] Preparing to detect languages for scanId: ${scanId}`)
                logger.updateScanProgress(scanId, 25, 'Detecting languages...', 'Analyzing file types')
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    scanId,
                    progress: 25,
                    stage: 'Detecting languages...',
                    details: 'Analyzing file types'
                })}\n\n`))

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
                }

                await saveScanToDatabase(runningScan as any)

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    progress: 30,
                    scanId: scanId,
                    stage: 'Running SAST analysis...',
                    details: 'Opengrep scanning in progress'
                })}\n\n`))

                logger.updateScanProgress(scanId, 30, 'Running SAST analysis...', 'Opengrep scanning in progress')

                const startTime = Date.now()

                // Create progress callback
                const progressCallback = async (update: { progress: number, stage: string, details?: string, analysis?: any, scannedFiles?: number, scannedLines?: number }) => {
                    const updateWithId = { ...update, scanId }
                    logger.updateScanProgress(scanId, update.progress, update.stage, update.details, update.analysis)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(updateWithId)}\n\n`))

                    // NOTE: Intermediate file writes disabled to prevent race condition corruption
                    // Analysis data persistence will happen when scan completes (line ~274)
                    // This prevents multiple concurrent writes from corrupting the JSON file
                }

                console.log(`[STREAM] Starting runScan for scanId: ${scanId}`)
                const { findings, languages, scannedLines, scannedFiles, logs, sastCount, trivyCount } = await runScan(
                    targetPath,
                    { ruleSet },
                    progressCallback
                )

                const duration = Math.round((Date.now() - startTime) / 1000)

                console.log(`[STREAM] runScan completed for scanId: ${scanId}, found ${findings.length} findings`)
                logger.updateScanProgress(scanId, 90, 'Processing results...', `Found ${findings.length} findings`)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    scanId,
                    progress: 90,
                    stage: 'Processing results...',
                    details: `Found ${findings.length} findings`,
                    scannedFiles,
                    scannedLines
                })}\n\n`))

                const fs = await import('fs/promises')
                const path = await import('path')

                const currentFindingsPromises = findings.map(async (f: any) => {
                    try {
                        const fingerprint = `${f.check_id}|${f.path}|${(f.extra?.message || '').substring(0, 50)}`

                        let code = (f.extra?.rendered_lines || f.extra?.lines || 'No code snippet available').toString().trim()
                        if (code === 'requires login' || code === 'required login') {
                            try {
                                const fullPath = path.isAbsolute(f.path) ? f.path : path.join(targetPath, f.path)
                                const fileContent = await fs.readFile(fullPath, 'utf8')
                                const lines = fileContent.split('\n')
                                const startLine = Math.max(0, (f.start?.line || 1) - 1)
                                const endLine = Math.min(lines.length, (f.end?.line || f.start?.line || 1))
                                code = lines.slice(startLine, endLine).join('\n').trim()
                            } catch (err) { }
                        }

                        const rawSev = (f.extra?.severity || 'LOW').toUpperCase()
                        let mappedSev = 'low'
                        if (['CRITICAL', 'FATAL'].includes(rawSev)) mappedSev = 'critical'
                        else if (['ERROR', 'HIGH'].includes(rawSev)) mappedSev = 'high'
                        else if (['WARNING', 'MEDIUM'].includes(rawSev)) mappedSev = 'medium'
                        else if (['LOW'].includes(rawSev)) mappedSev = 'low'
                        else if (['INFO'].includes(rawSev)) mappedSev = 'info'

                        return {
                            id: `scan-${Math.random().toString(36).substring(7)}`,
                            fingerprint,
                            isNew: false,
                            title: f.check_id?.split('.').pop() || 'Issue',
                            severity: mappedSev,
                            file: f.path || 'unknown',
                            line: f.start?.line || 0,
                            column: f.start?.col || 0,
                            message: f.extra?.message || 'No message provided',
                            code: code || 'No code snippet available',
                            category: f.extra?.metadata?.category || 'Security',
                            cwe: f.extra?.metadata?.cwe?.[0],
                            owasp: f.extra?.metadata?.owasp?.[0],
                            fix: f.extra?.remediation || 'Please review the security best practices.'
                        }
                    } catch (err) {
                        console.error(`[STREAM] Error processing finding for ${f.path}:`, err)
                        return null
                    }
                })

                const currentFindings = (await Promise.all(currentFindingsPromises)).filter(f => f !== null)

                const scanResult = {
                    ...runningScan,
                    status: 'completed',
                    stats: {
                        filesScanned: scannedFiles,
                        linesScanned: scannedLines,
                        duration: duration,
                        sastCount: sastCount,
                        trivyCount: trivyCount,
                        findings: {
                            critical: currentFindings.filter((f: any) => f.severity === 'critical').length,
                            high: currentFindings.filter((f: any) => f.severity === 'high').length,
                            medium: currentFindings.filter((f: any) => f.severity === 'medium').length,
                            low: currentFindings.filter((f: any) => f.severity === 'low').length,
                            info: currentFindings.filter((f: any) => f.severity === 'info').length
                        }
                    },
                    languages: languages,
                    findings: currentFindings,
                    logs: logs
                }

                await saveScanToDatabase(scanResult as any)

                // Send 100% progress update
                logger.updateScanProgress(scanId, 100, 'Complete', 'Scan finished successfully')
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    scanId,
                    progress: 100,
                    stage: 'Complete',
                    details: 'Scan finished successfully'
                })}\n\n`))

                // Auto-send to Telegram if enabled
                try {
                    const { loadTelegramConfig, sendPdfToTelegram } = await import('@/lib/telegram');
                    const { generateScanPdfBuffer } = await import('@/lib/pdf-export');

                    const telegramConfig = await loadTelegramConfig();

                    if (telegramConfig && telegramConfig.enabled) {
                        console.log('[STREAM] Telegram notifications enabled, generating PDF...');

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

                            console.log(`[STREAM] Getting or creating Telegram topic for: ${pdfData.source.name}...`);
                            const topicResult = await getOrCreateForumTopic(pdfData.source.name);

                            if (topicResult.success) {
                                messageThreadId = topicResult.message_thread_id;
                                console.log(`[STREAM] Topic ID: ${messageThreadId}`);
                            } else {
                                console.warn('[STREAM] Could not get/create Telegram topic:', topicResult.error);
                            }

                            const telegramResult = await sendPdfToTelegram(buffer, filename, caption, messageThreadId);

                            if (telegramResult.success) {
                                console.log('[STREAM] ✅ PDF report sent to Telegram successfully');
                            } else {
                                console.warn('[STREAM] ⚠️ Failed to send to Telegram:', telegramResult.error);
                            }
                        } else {
                            console.warn('[STREAM] ⚠️ Failed to generate PDF buffer');
                        }
                    }
                } catch (telegramError) {
                    // Don't fail the scan if Telegram notification fails
                    console.warn('[STREAM] Telegram notification error (non-critical):', telegramError);
                }

                if (isTemp) await cleanupTemp(targetPath)

                // Send final result with small delay to ensure 100% progress is received
                await new Promise(resolve => setTimeout(resolve, 300));

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    scanId,
                    result: scanResult
                })}\n\n`))

                logger.removeActiveScan(scanId)
                controller.close()
            } catch (error: any) {
                if (scanId) logger.removeActiveScan(scanId)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    error: error.message
                })}\n\n`))
                controller.close()
            }
        }
    })

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    })
}
