import { prisma } from './prisma';

export interface ScanInput {
    id: string;
    timestamp: string;
    status: string;
    source: {
        name: string;
        type: string;
        url?: string | null;
        path?: string | null;
    };
    stats: {
        filesScanned: number;
        linesScanned: number;
        duration: number;
        sastCount?: number;
        trivyCount?: number;
        findings: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
        };
    };
    languages?: string[];
    logs?: string;
    fileTree?: any[];
    analysis?: any;
    isRescan?: boolean;
    comparedWithId?: string | null;
    findings: any[];
}

export async function saveScanToDatabase(scanData: ScanInput) {
    try {
        // Check if scan already exists
        const existing = await prisma.scan.findUnique({
            where: { id: scanData.id },
        });

        if (existing) {
            // Update existing scan
            return await prisma.scan.update({
                where: { id: scanData.id },
                data: {
                    timestamp: new Date(scanData.timestamp),
                    status: scanData.status,

                    sourceName: scanData.source.name,
                    sourceType: scanData.source.type,
                    sourceUrl: scanData.source.url,
                    sourcePath: scanData.source.path,

                    filesScanned: scanData.stats.filesScanned,
                    linesScanned: scanData.stats.linesScanned,
                    duration: scanData.stats.duration,
                    sastCount: scanData.stats.sastCount || 0,
                    trivyCount: scanData.stats.trivyCount || 0,

                    criticalCount: scanData.stats.findings.critical,
                    highCount: scanData.stats.findings.high,
                    mediumCount: scanData.stats.findings.medium,
                    lowCount: scanData.stats.findings.low,
                    infoCount: scanData.stats.findings.info,

                    languages: JSON.stringify(scanData.languages || []),
                    logs: scanData.logs || null,
                    fileTree: JSON.stringify(scanData.fileTree || []),
                    analysis: scanData.analysis ? JSON.stringify(scanData.analysis) : null,

                    isRescan: scanData.isRescan || false,
                    comparedWithId: scanData.comparedWithId || null,

                    // Delete old findings and create new ones
                    findings: {
                        deleteMany: {},
                        create: scanData.findings.map((f: any) => ({
                            fingerprint: f.fingerprint || `${f.title}|${f.file}|${f.line}`,
                            isNew: f.isNew || false,
                            title: f.title || 'Unknown',
                            severity: f.severity || 'info',
                            message: f.message || '',
                            category: f.category || 'Security',
                            file: f.file || '',
                            line: f.line || 0,
                            column: f.column || 0,
                            code: f.code || '',
                            fix: f.fix || null,
                            cwe: f.cwe || null,
                            owasp: f.owasp || null,
                        })),
                    },
                },
                include: {
                    findings: true,
                },
            });
        } else {
            // Create new scan
            return await prisma.scan.create({
                data: {
                    id: scanData.id,
                    timestamp: new Date(scanData.timestamp),
                    status: scanData.status,

                    sourceName: scanData.source.name,
                    sourceType: scanData.source.type,
                    sourceUrl: scanData.source.url,
                    sourcePath: scanData.source.path,

                    filesScanned: scanData.stats.filesScanned,
                    linesScanned: scanData.stats.linesScanned,
                    duration: scanData.stats.duration,
                    sastCount: scanData.stats.sastCount || 0,
                    trivyCount: scanData.stats.trivyCount || 0,

                    criticalCount: scanData.stats.findings.critical,
                    highCount: scanData.stats.findings.high,
                    mediumCount: scanData.stats.findings.medium,
                    lowCount: scanData.stats.findings.low,
                    infoCount: scanData.stats.findings.info,

                    languages: JSON.stringify(scanData.languages || []),
                    logs: scanData.logs || null,
                    fileTree: JSON.stringify(scanData.fileTree || []),
                    analysis: scanData.analysis ? JSON.stringify(scanData.analysis) : null,

                    isRescan: scanData.isRescan || false,
                    comparedWithId: scanData.comparedWithId || null,

                    findings: {
                        create: scanData.findings.map((f: any) => ({
                            fingerprint: f.fingerprint || `${f.title}|${f.file}|${f.line}`,
                            isNew: f.isNew || false,
                            title: f.title || 'Unknown',
                            severity: f.severity || 'info',
                            message: f.message || '',
                            category: f.category || 'Security',
                            file: f.file || '',
                            line: f.line || 0,
                            column: f.column || 0,
                            code: f.code || '',
                            fix: f.fix || null,
                            cwe: f.cwe || null,
                            owasp: f.owasp || null,
                        })),
                    },
                },
                include: {
                    findings: true,
                },
            });
        }
    } catch (error) {
        console.error('Error saving scan to database:', error);
        throw error;
    }
}

export async function getScanById(scanId: string) {
    const scan = await prisma.scan.findUnique({
        where: { id: scanId },
        include: {
            findings: true,
        },
    });

    if (!scan) {
        return null;
    }

    // Transform to match old JSON format
    return {
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
    };
}

/**
 * Get recent scans, optionally filtered by status
 */
export async function getRecentScans(limit: number = 10, status?: string) {
    const where = status ? { status } : {};

    const scans = await prisma.scan.findMany({
        where,
        orderBy: {
            timestamp: 'desc',
        },
        take: limit,
        select: {
            id: true,
            timestamp: true,
            status: true,
            sourceName: true,
            sourceType: true,
            criticalCount: true,
            highCount: true,
            mediumCount: true,
            lowCount: true,
            infoCount: true,
        },
    });

    return scans.map(scan => ({
        id: scan.id,
        timestamp: scan.timestamp.toISOString(),
        status: scan.status,
        sourceName: scan.sourceName,
        sourceType: scan.sourceType,
        findings: {
            critical: scan.criticalCount,
            high: scan.highCount,
            medium: scan.mediumCount,
            low: scan.lowCount,
            info: scan.infoCount,
        },
    }));
}
