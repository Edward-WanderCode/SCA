import { NextResponse } from 'next/server'
import { runScan, createTemporaryRepo, cleanupTemp } from '@/lib/scanner'

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

        const { saveScanResult } = await import('@/lib/scanner')
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

        await saveScanResult(runningScan);

        console.log(`Starting Opengrep + Trivy scan on: ${targetPath}`)
        const startTime = Date.now();
        const { findings, languages, scannedLines, scannedFiles, logs, fileTree, sastCount, trivyCount } = await runScan(targetPath, { ruleSet })
        const duration = Math.round((Date.now() - startTime) / 1000);

        let previousFindings: any[] = []
        if (compareWithId) {
            const historyFile = (await import('path')).join(process.cwd(), '.sca-data', 'scans.json')
            try {
                const historyContent = await (await import('fs/promises')).readFile(historyFile, 'utf-8')
                const history = JSON.parse(historyContent)
                const prevScan = history.find((s: any) => s.id === compareWithId)
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
                    const fullPath = path.isAbsolute(f.path) ? f.path : path.join(targetPath, f.path);
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
            language: languages.join(', ') || 'Auto-detected',
            findings: currentFindings,
            logs: logs,
            fileTree: fileTree
        }

        await saveScanResult(scanResult)
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
