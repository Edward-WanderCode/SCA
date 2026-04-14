import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const view = searchParams.get('view'); // 'tree' or 'list'

        const scans = await prisma.scan.findMany({
            include: {
                findings: true,
            },
            orderBy: {
                timestamp: 'desc',
            },
        });

        // Transform to match old JSON format
        const history = scans.map(scan => ({
            id: scan.id,
            timestamp: scan.timestamp.toISOString(),
            status: scan.status,
            source: {
                name: scan.sourceName,
                type: scan.sourceType,
                url: scan.sourceUrl,
                path: scan.sourcePath,
            },
            stats: {
                filesScanned: scan.filesScanned,
                linesScanned: scan.linesScanned,
                duration: scan.duration,
                sastCount: scan.sastCount,
                trivyCount: scan.trivyCount,
                secretCount: scan.secretCount,
                linterCount: (scan as any).linterCount || 0,
                findings: {
                    critical: scan.criticalCount,
                    high: scan.highCount,
                    medium: scan.mediumCount,
                    low: scan.lowCount,
                    info: scan.infoCount,
                },
            },
            languages: JSON.parse(scan.languages),
            logs: scan.logs,
            fileTree: JSON.parse(scan.fileTree),
            analysis: scan.analysis ? JSON.parse(scan.analysis) : null,
            isRescan: scan.isRescan,
            comparedWithId: scan.comparedWithId,
            findings: scan.findings,
        }));

        // If tree view is requested, group scans by project
        if (view === 'tree') {
            const grouped = new Map<string, any>();

            history.forEach(scan => {
                const key = scan.source.path || scan.source.url || scan.source.name;

                if (!grouped.has(key)) {
                    grouped.set(key, {
                        projectKey: key,
                        projectName: scan.source.name,
                        projectType: scan.source.type,
                        projectPath: scan.source.path,
                        projectUrl: scan.source.url,
                        scans: [],
                        totalScans: 0,
                        latestScan: null,
                    });
                }

                const group = grouped.get(key);
                group.scans.push(scan);
                group.totalScans++;

                // Update latest scan
                if (!group.latestScan || new Date(scan.timestamp) > new Date(group.latestScan.timestamp)) {
                    group.latestScan = scan;
                }
            });

            // Calculate comparison stats for each group
            const treeData = Array.from(grouped.values()).map(group => {
                const sortedScans = group.scans.sort((a: any, b: any) =>
                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );

                // Calculate trend (compare latest with previous)
                let trend = null;
                if (sortedScans.length >= 2) {
                    const latest = sortedScans[0];
                    const previous = sortedScans[1];

                    const latestTotal = latest.stats.findings.critical + latest.stats.findings.high +
                        latest.stats.findings.medium + latest.stats.findings.low + latest.stats.findings.info;
                    const previousTotal = previous.stats.findings.critical + previous.stats.findings.high +
                        previous.stats.findings.medium + previous.stats.findings.low + previous.stats.findings.info;

                    const diff = latestTotal - previousTotal;
                    const percentChange = previousTotal > 0 ? ((diff / previousTotal) * 100).toFixed(1) : '0';

                    trend = {
                        direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'stable',
                        difference: Math.abs(diff),
                        percentChange: parseFloat(percentChange),
                        latestTotal,
                        previousTotal,
                    };
                }

                return {
                    ...group,
                    scans: sortedScans,
                    trend,
                };
            });

            return NextResponse.json({ success: true, history, treeData });
        }

        return NextResponse.json({ success: true, history });
    } catch (error: any) {
        console.error('API History Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'Missing scan ID' }, { status: 400 });
        }

        const scan = await prisma.scan.delete({
            where: { id },
        });

        if (!scan) {
            return NextResponse.json({ success: false, error: 'Scan not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Scan deleted successfully' });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return NextResponse.json({ success: false, error: 'Scan not found' }, { status: 404 });
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
