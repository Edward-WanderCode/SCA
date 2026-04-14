/**
 * Cleanup Scheduler
 * 
 * Provides automatic periodic cleanup of temp directories.
 * Designed to be started once when the Next.js server boots,
 * ensuring stale temp files from crashed scans don't fill up disk.
 */

import fs from 'fs/promises';
import path from 'path';

const TEMP_DIR = path.join(process.cwd(), 'temp');
const MAX_AGE_HOURS = 24;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Run every 1 hour

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

async function cleanupOldTempFolders(): Promise<{ cleaned: number; failed: number }> {
    let cleaned = 0;
    let failed = 0;

    try {
        try {
            await fs.access(TEMP_DIR);
        } catch {
            return { cleaned: 0, failed: 0 };
        }

        const entries = await fs.readdir(TEMP_DIR, { withFileTypes: true });
        const now = Date.now();

        for (const entry of entries) {
            if (entry.name === '.gitkeep') continue;

            if (entry.isDirectory()) {
                const dirPath = path.join(TEMP_DIR, entry.name);

                try {
                    const stats = await fs.stat(dirPath);
                    const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);

                    if (ageHours > MAX_AGE_HOURS) {
                        console.log(`[Cleanup] Removing stale temp: ${entry.name} (${ageHours.toFixed(1)}h old)`);
                        await fs.rm(dirPath, { recursive: true, force: true, maxRetries: 3 });
                        cleaned++;
                    }
                } catch (err) {
                    failed++;
                    console.warn(`[Cleanup] Failed to remove ${entry.name}:`, err instanceof Error ? err.message : String(err));
                }
            }
        }
    } catch (error) {
        console.error('[Cleanup] Scheduler error:', error);
    }

    return { cleaned, failed };
}

/**
 * Start the automatic cleanup scheduler.
 * Safe to call multiple times — only one timer will be active.
 */
export function startCleanupScheduler(): void {
    if (cleanupTimer) return; // Already running

    console.log('[Cleanup] Starting automatic temp cleanup scheduler (every 1h)');

    // Run once immediately on boot
    cleanupOldTempFolders().then(({ cleaned, failed }) => {
        if (cleaned > 0 || failed > 0) {
            console.log(`[Cleanup] Boot cleanup: removed ${cleaned}, failed ${failed}`);
        }
    });

    // Schedule periodic runs
    cleanupTimer = setInterval(async () => {
        const { cleaned, failed } = await cleanupOldTempFolders();
        if (cleaned > 0 || failed > 0) {
            console.log(`[Cleanup] Periodic cleanup: removed ${cleaned}, failed ${failed}`);
        }
    }, CLEANUP_INTERVAL_MS);

    // Don't prevent Node from exiting
    if (cleanupTimer.unref) {
        cleanupTimer.unref();
    }
}
