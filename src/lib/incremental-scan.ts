import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export interface FileHash {
    path: string;
    hash: string;
    size: number;
    mtime: number; // modification time
}

export interface ScanCache {
    scanId: string;
    timestamp: string;
    targetPath: string;
    fileHashes: FileHash[];
    findings: any[]; // findings mapped by file path
}

/**
 * Calculate MD5 hash of a file
 */
export async function calculateFileHash(filePath: string): Promise<string> {
    try {
        const content = await fs.readFile(filePath);
        return createHash('md5').update(content).digest('hex');
    } catch (error) {
        console.error(`Error hashing file ${filePath}:`, error);
        return '';
    }
}

/**
 * Get file metadata (size and modification time)
 */
export async function getFileMetadata(filePath: string): Promise<{ size: number; mtime: number }> {
    try {
        const stats = await fs.stat(filePath);
        return {
            size: stats.size,
            mtime: stats.mtimeMs
        };
    } catch (error) {
        return { size: 0, mtime: 0 };
    }
}

/**
 * Build file hash map for all files in a directory
 */
export async function buildFileHashMap(
    targetPath: string,
    files: string[]
): Promise<Map<string, FileHash>> {
    const hashMap = new Map<string, FileHash>();

    await Promise.all(
        files.map(async (file) => {
            const fullPath = path.isAbsolute(file) ? file : path.join(targetPath, file);
            const hash = await calculateFileHash(fullPath);
            const metadata = await getFileMetadata(fullPath);

            if (hash) {
                hashMap.set(file, {
                    path: file,
                    hash,
                    size: metadata.size,
                    mtime: metadata.mtime
                });
            }
        })
    );

    return hashMap;
}

/**
 * Compare two file hash maps and return changed/new/deleted files
 */
export function detectChangedFiles(
    oldHashMap: Map<string, FileHash>,
    newHashMap: Map<string, FileHash>
): {
    changed: string[];
    new: string[];
    deleted: string[];
    unchanged: string[];
} {
    const changed: string[] = [];
    const newFiles: string[] = [];
    const deleted: string[] = [];
    const unchanged: string[] = [];

    // Check for changed and new files
    for (const [filePath, newHash] of newHashMap.entries()) {
        const oldHash = oldHashMap.get(filePath);

        if (!oldHash) {
            newFiles.push(filePath);
        } else if (oldHash.hash !== newHash.hash) {
            changed.push(filePath);
        } else {
            unchanged.push(filePath);
        }
    }

    // Check for deleted files
    for (const filePath of oldHashMap.keys()) {
        if (!newHashMap.has(filePath)) {
            deleted.push(filePath);
        }
    }

    return { changed, new: newFiles, deleted, unchanged };
}

/**
 * Load scan cache from previous scan
 */
export async function loadScanCache(scanId: string): Promise<ScanCache | null> {
    try {
        const { getScanById } = await import('./db-helpers');
        const scan = await getScanById(scanId);

        if (!scan) {
            return null;
        }

        // Extract file hashes from scan metadata (if stored)
        const fileHashes: FileHash[] = [];
        if (scan.analysis) {
            let analysis: any;
            if (typeof scan.analysis === 'string') {
                try {
                    analysis = JSON.parse(scan.analysis);
                } catch (e) {
                    console.error('Failed to parse scan analysis JSON');
                }
            } else {
                analysis = scan.analysis;
            }

            if (analysis && analysis.fileHashes) {
                fileHashes.push(...analysis.fileHashes);
            }
        }

        return {
            scanId: scan.id,
            timestamp: scan.timestamp,
            targetPath: scan.source.path || '',
            fileHashes,
            findings: scan.findings || []
        };
    } catch (error) {
        console.error('Error loading scan cache:', error);
        return null;
    }
}

/**
 * Filter findings by file paths
 */
export function filterFindingsByFiles(
    findings: any[],
    filePaths: string[]
): any[] {
    const fileSet = new Set(filePaths);
    return findings.filter(finding => fileSet.has(finding.file));
}

/**
 * Merge old and new findings
 * - Remove findings from changed/deleted files
 * - Keep findings from unchanged files
 * - Add new findings
 */
export function mergeFindingsIncremental(
    oldFindings: any[],
    newFindings: any[],
    changedFiles: string[],
    deletedFiles: string[]
): any[] {
    const changedAndDeleted = new Set([...changedFiles, ...deletedFiles]);

    // Keep only findings from unchanged files
    const preservedFindings = oldFindings.filter(
        finding => !changedAndDeleted.has(finding.file)
    );

    // Add all new findings (from changed and new files)
    return [...preservedFindings, ...newFindings];
}

/**
 * Check if incremental scan is possible
 */
export async function canUseIncrementalScan(
    targetPath: string,
    previousScanId?: string
): Promise<{ possible: boolean; reason?: string; cache?: ScanCache }> {
    if (!previousScanId) {
        return { possible: false, reason: 'No previous scan ID provided' };
    }

    const cache = await loadScanCache(previousScanId);

    if (!cache) {
        return { possible: false, reason: 'Previous scan cache not found' };
    }

    if (cache.targetPath !== targetPath) {
        return { possible: false, reason: 'Target path has changed' };
    }

    if (cache.fileHashes.length === 0) {
        return { possible: false, reason: 'No file hashes in previous scan' };
    }

    return { possible: true, cache };
}

/**
 * Get list of files to scan (only changed files for incremental)
 */
export async function getFilesToScan(
    allFiles: string[],
    targetPath: string,
    previousScanId?: string
): Promise<{
    filesToScan: string[];
    isIncremental: boolean;
    stats: {
        total: number;
        changed: string[];
        new: string[];
        deleted: string[];
        unchanged: string[];
    };
    oldFindings?: any[];
}> {
    // Check if incremental scan is possible
    const incrementalCheck = await canUseIncrementalScan(targetPath, previousScanId);

    if (!incrementalCheck.possible || !incrementalCheck.cache) {
        console.log(`[Incremental] Full scan: ${incrementalCheck.reason}`);
        return {
            filesToScan: allFiles,
            isIncremental: false,
            stats: {
                total: allFiles.length,
                changed: [],
                new: allFiles,
                deleted: [],
                unchanged: []
            }
        };
    }

    // Build hash maps
    console.log('[Incremental] Building file hash maps...');
    const oldHashMap = new Map(
        incrementalCheck.cache.fileHashes.map(fh => [fh.path, fh])
    );
    const newHashMap = await buildFileHashMap(targetPath, allFiles);

    // Detect changes
    const changes = detectChangedFiles(oldHashMap, newHashMap);

    console.log('[Incremental] Change detection results:', {
        changed: changes.changed.length,
        new: changes.new.length,
        deleted: changes.deleted.length,
        unchanged: changes.unchanged.length
    });

    // Files to scan = changed + new
    const filesToScan = [...changes.changed, ...changes.new];

    // If too many files changed, or no files were scanned before, do full scan
    // threshold: 10% of total files OR max 200 files (to avoid command line limit on Windows)
    const changePercentage = allFiles.length > 0 ? (filesToScan.length / allFiles.length) * 100 : 0;
    if (changePercentage > 10 || filesToScan.length > 200) {
        console.log(`[Incremental] Too many changes (${filesToScan.length} files), switching to full scan`);
        return {
            filesToScan: allFiles,
            isIncremental: false,
            stats: {
                total: allFiles.length,
                changed: changes.changed,
                new: changes.new,
                deleted: changes.deleted,
                unchanged: changes.unchanged
            }
        };
    }

    return {
        filesToScan,
        isIncremental: true,
        stats: {
            total: allFiles.length,
            changed: changes.changed,
            new: changes.new,
            deleted: changes.deleted,
            unchanged: changes.unchanged
        },
        oldFindings: incrementalCheck.cache.findings
    };
}
