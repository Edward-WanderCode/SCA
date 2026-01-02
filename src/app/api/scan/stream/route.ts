import { NextResponse } from 'next/server'
import { runScan, createTemporaryRepo, cleanupTemp, saveScanResult } from '@/lib/scanner'
import { logger } from '@/lib/logger'

export const maxDuration = 300;

export async function POST(request: Request) {
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
        async start(controller) {
            let scanId = '';
            try {
                const { url, method, folderPath, ruleSet = 'Community (Standard)' } = await request.json()

                let targetPath = process.cwd()
                let isTemp = false

                // Send initial progress
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    progress: 5,
                    stage: 'Initializing scan...',
                    details: 'Setting up environment'
                })}\n\n`))

                if (method === 'git' && url) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        progress: 10,
                        stage: 'Cloning repository...',
                        details: url
                    })}\n\n`))

                    targetPath = await createTemporaryRepo(url)
                    isTemp = true

                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        progress: 20,
                        stage: 'Repository cloned',
                        details: 'Starting analysis'
                    })}\n\n`))
                } else if (method === 'folder' && folderPath) {
                    const fs = await import('fs/promises')
                    const path = await import('path')

                    try {
                        const stats = await fs.stat(folderPath)
                        if (!stats.isDirectory()) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                error: 'Invalid path: Not a directory'
                            })}\n\n`))
                            controller.close()
                            return
                        }
                        targetPath = path.resolve(folderPath)

                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            progress: 15,
                            stage: 'Scanning local folder',
                            details: targetPath
                        })}\n\n`))
                    } catch (err: any) {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            error: `Cannot access folder: ${err.message}`
                        })}\n\n`))
                        controller.close()
                        return
                    }
                }

                const { saveScanResult } = await import('@/lib/scanner')
                scanId = `scan-${Math.random().toString(36).substring(7)}`
                const timestamp = new Date().toISOString()

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
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
                    findings: []
                }

                await saveScanResult(runningScan)

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    progress: 30,
                    scanId: scanId,
                    stage: 'Running SAST analysis...',
                    details: 'Opengrep scanning in progress'
                })}\n\n`))

                logger.updateScanProgress(scanId, 30, 'Running SAST analysis...', 'Opengrep scanning in progress')

                const startTime = Date.now()

                // Create progress callback
                const progressCallback = (update: { progress: number, stage: string, details?: string, analysis?: any }) => {
                    logger.updateScanProgress(scanId, update.progress, update.stage, update.details, update.analysis)
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`))
                }

                const { findings, languages, scannedLines, scannedFiles, logs } = await runScan(
                    targetPath,
                    { ruleSet },
                    progressCallback
                )

                const duration = Math.round((Date.now() - startTime) / 1000)

                logger.updateScanProgress(scanId, 90, 'Processing results...', `Found ${findings.length} findings`)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    progress: 90,
                    stage: 'Processing results...',
                    details: `Found ${findings.length} findings`,
                    scannedFiles,
                    scannedLines
                })}\n\n`))

                const fs = await import('fs/promises')
                const path = await import('path')

                const currentFindings = await Promise.all(findings.map(async (f: any) => {
                    const fingerprint = `${f.check_id}|${f.path}|${f.extra.message.substring(0, 50)}`

                    let code = (f.extra.rendered_lines || f.extra.lines || 'No code snippet available').trim()
                    if (code === 'requires login' || code === 'required login') {
                        try {
                            const fullPath = path.isAbsolute(f.path) ? f.path : path.join(targetPath, f.path)
                            const fileContent = await fs.readFile(fullPath, 'utf8')
                            const lines = fileContent.split('\n')
                            const startLine = Math.max(0, f.start.line - 1)
                            const endLine = Math.min(lines.length, f.end.line)
                            code = lines.slice(startLine, endLine).join('\n').trim()
                        } catch (err) { }
                    }

                    const rawSev = f.extra.severity.toUpperCase()
                    let mappedSev = 'low'
                    if (['ERROR', 'CRITICAL', 'FATAL'].includes(rawSev)) mappedSev = 'critical'
                    else if (['WARNING', 'HIGH', 'MEDIUM'].includes(rawSev)) mappedSev = 'medium'

                    return {
                        id: `og-${Math.random().toString(36).substring(7)}`,
                        fingerprint,
                        isNew: false,
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
                }))

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
                        }
                    },
                    language: languages.join(', ') || 'Auto-detected',
                    findings: currentFindings,
                    logs: logs
                }

                await saveScanResult(scanResult)
                if (isTemp) await cleanupTemp(targetPath)

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    progress: 100,
                    stage: 'Complete',
                    details: 'Scan finished successfully',
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
