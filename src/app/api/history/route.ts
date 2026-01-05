import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
    try {
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
