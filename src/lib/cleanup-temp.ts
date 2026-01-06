/**
 * Cleanup old temporary directories
 * This script can be run periodically to clean up temp folders that weren't cleaned up properly
 */

import fs from 'fs/promises';
import path from 'path';
import { cleanupTemp } from './scanner';

const TEMP_DIR = path.join(process.cwd(), 'temp');
const MAX_AGE_HOURS = 24; // Delete temp folders older than 24 hours

async function cleanupOldTempFolders() {
    console.log('[Cleanup] Starting cleanup of old temp folders...');

    try {
        // Check if temp directory exists
        try {
            await fs.access(TEMP_DIR);
        } catch {
            console.log('[Cleanup] Temp directory does not exist, nothing to clean');
            return;
        }

        const entries = await fs.readdir(TEMP_DIR, { withFileTypes: true });
        const now = Date.now();
        let cleanedCount = 0;
        let failedCount = 0;

        for (const entry of entries) {
            // Skip .gitkeep file
            if (entry.name === '.gitkeep') continue;

            if (entry.isDirectory()) {
                const dirPath = path.join(TEMP_DIR, entry.name);

                try {
                    const stats = await fs.stat(dirPath);
                    const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);

                    if (ageHours > MAX_AGE_HOURS) {
                        console.log(`[Cleanup] Removing old temp folder: ${entry.name} (age: ${ageHours.toFixed(1)} hours)`);

                        try {
                            await cleanupTemp(dirPath);
                            cleanedCount++;
                            console.log(`[Cleanup] ✅ Successfully removed: ${entry.name}`);
                        } catch (cleanupError) {
                            failedCount++;
                            console.error(`[Cleanup] ❌ Failed to remove ${entry.name}:`, cleanupError);
                        }
                    } else {
                        console.log(`[Cleanup] Keeping recent folder: ${entry.name} (age: ${ageHours.toFixed(1)} hours)`);
                    }
                } catch (statError) {
                    console.warn(`[Cleanup] Could not stat ${entry.name}:`, statError);
                }
            }
        }

        console.log(`[Cleanup] Cleanup completed. Removed: ${cleanedCount}, Failed: ${failedCount}`);
    } catch (error) {
        console.error('[Cleanup] Error during cleanup:', error);
    }
}

// Run cleanup
cleanupOldTempFolders()
    .then(() => {
        console.log('[Cleanup] Done');
        process.exit(0);
    })
    .catch((error) => {
        console.error('[Cleanup] Fatal error:', error);
        process.exit(1);
    });
