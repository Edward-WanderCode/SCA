import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { convertToSARIF } from '@/lib/sarif';

/**
 * GET /api/scan/sarif?id=<scanId>
 * 
 * Export scan results as SARIF 2.1.0 JSON.
 * Compatible with GitHub Code Scanning, GitLab CI, Azure DevOps, VS Code SARIF Viewer, etc.
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const scanId = searchParams.get('id');

        if (!scanId) {
            return NextResponse.json(
                { error: 'Missing required parameter: id' },
                { status: 400 }
            );
        }

        const scan = await prisma.scan.findUnique({
            where: { id: scanId },
            include: { findings: true },
        });

        if (!scan) {
            return NextResponse.json(
                { error: 'Scan not found' },
                { status: 404 }
            );
        }

        // Transform DB data to internal format
        const scanData = {
            id: scan.id,
            timestamp: scan.timestamp.toISOString(),
            source: {
                name: scan.sourceName,
                type: scan.sourceType,
            },
            stats: {
                filesScanned: scan.filesScanned,
                linesScanned: scan.linesScanned,
                duration: scan.duration,
                findings: {
                    critical: scan.criticalCount,
                    high: scan.highCount,
                    medium: scan.mediumCount,
                    low: scan.lowCount,
                    info: scan.infoCount,
                },
                sastCount: scan.sastCount,
                trivyCount: scan.trivyCount,
                secretCount: scan.secretCount,
                linterCount: (scan as any).linterCount || 0,
            },
            findings: scan.findings.map(f => ({
                id: f.id,
                fingerprint: f.fingerprint,
                title: f.title,
                severity: f.severity as any,
                message: f.message,
                category: f.category,
                file: f.file,
                line: f.line,
                column: f.column,
                code: f.code,
                fix: f.fix || undefined,
                cwe: f.cwe || undefined,
                owasp: f.owasp || undefined,
            })),
            languages: JSON.parse(scan.languages),
        };

        // Convert to SARIF
        const sarif = convertToSARIF(scanData);

        // Return as downloadable JSON file
        const filename = `sca-report-${scan.sourceName.replace(/[^a-zA-Z0-9]/g, '_')}-${scan.id}.sarif.json`;

        return new NextResponse(JSON.stringify(sarif, null, 2), {
            status: 200,
            headers: {
                'Content-Type': 'application/sarif+json',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (error: any) {
        console.error('SARIF Export Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to export SARIF' },
            { status: 500 }
        );
    }
}
