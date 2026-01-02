// src/lib/opengrep-utils.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';

const execAsync = promisify(exec);

export async function downloadOpenGrepRules() {
    const rulesDir = path.join(process.cwd(), 'OpenGrep', 'rules');
    const cacheDir = path.join(process.cwd(), 'OpenGrep', '.rules-cache');
    const repoUrl = 'https://github.com/opengrep/opengrep-rules';

    try {
        // Ensure OpenGrep directory exists
        await fs.mkdir(path.join(process.cwd(), 'OpenGrep'), { recursive: true });

        // Update or Clone the Cache Repository
        const cacheExists = await fs.access(cacheDir).then(() => true).catch(() => false);
        const dotGitExists = await fs.access(path.join(cacheDir, '.git')).then(() => true).catch(() => false);

        if (cacheExists && dotGitExists) {
            console.log('[OpenGrep] Updating rules cache...');
            logger.addLog('REGISTRY', 'Updating rules cache from GitHub...');
            // Fix: Add safe.directory configuration to avoid "dubious ownership" errors on Windows
            await execAsync('git -c safe.directory=* reset --hard', { cwd: cacheDir });
            await execAsync('git -c safe.directory=* pull', { cwd: cacheDir });
            logger.addLog('REGISTRY', 'Rules cache successfully updated');
        } else {
            console.log('[OpenGrep] Initializing rules cache...');
            logger.addLog('REGISTRY', 'Initializing rules cache (Cloning repository)...');
            if (cacheExists) {
                await fs.rm(cacheDir, { recursive: true, force: true });
            }
            // Clone usually establishes ownership correctly, but strict environments might still complain later
            await execAsync(`git clone --depth 1 ${repoUrl} "${cacheDir}"`);
            logger.addLog('REGISTRY', 'Rules cache successfully cloned');
        }

        // Deploy/Sync only the necessary rule folders to the main rules directory
        console.log('[OpenGrep] Deploying clean rules to main directory...');
        logger.addLog('SYSTEM', 'Deploying clean rules to main directory...');

        // Wipe existing rules dir to ensure a clean state
        if (await fs.access(rulesDir).then(() => true).catch(() => false)) {
            await fs.rm(rulesDir, { recursive: true, force: true });
        }
        await fs.mkdir(rulesDir, { recursive: true });

        // List everything in cache
        const items = await fs.readdir(cacheDir);

        for (const item of items) {
            const srcPath = path.join(cacheDir, item);
            const destPath = path.join(rulesDir, item);
            const stats = await fs.stat(srcPath);

            // Skip hidden files/folders (like .git, .github, .pre-commit)
            if (item.startsWith('.')) continue;

            // Skip known meta-directories and meta-files
            const skipList = ['scripts', 'stats', 'tests', 'Makefile', 'Pipfile', 'Pipfile.lock', 'LICENSE', 'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md'];
            if (skipList.includes(item)) continue;

            // Only copy directories (rule packs) and legitimate .yaml rule files
            if (stats.isDirectory() || (stats.isFile() && (item.endsWith('.yaml') || item.endsWith('.yml')))) {
                // For Opengrep rules repository, the top level YAML items that are NOT in skipList 
                // might still be problematic meta-files. 
                // In opengrep-rules, legitimate rules are usually inside subdirectories.
                // If it's a file at root, let's be extra careful.
                if (stats.isFile()) {
                    // Check if it's a valid rule file (very basic check: should contain 'rules:')
                    const content = await fs.readFile(srcPath, 'utf-8');
                    if (!content.includes('rules:')) {
                        console.log(`[OpenGrep] Skipping non-rule file: ${item}`);
                        continue;
                    }
                }

                // Copy directory or file
                await cpRecursive(srcPath, destPath);
            }
        }

        return {
            success: true,
            message: 'Rules updated and cleaned successfully'
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[OpenGrep] Error updating rules:', error);
        return {
            success: false,
            message: 'Failed to update rules',
            error: message
        };
    }
}

/**
 * Helper to copy files/directories recursively
 */
async function cpRecursive(src: string, dest: string) {
    const stats = await fs.stat(src);
    if (stats.isDirectory()) {
        await fs.mkdir(dest, { recursive: true });
        const items = await fs.readdir(src);
        for (const item of items) {
            await cpRecursive(path.join(src, item), path.join(dest, item));
        }
    } else {
        await fs.copyFile(src, dest);
    }
}

export async function checkRulesStatus() {
    const rulesDir = path.join(process.cwd(), 'OpenGrep', 'rules');
    const exists = await fs.access(rulesDir).then(() => true).catch(() => false);

    if (!exists) {
        return { isDownloaded: false };
    }

    try {
        const stats = await fs.stat(rulesDir);
        // Count some files to give an estimate of rule count
        // In Opengrep rules, they are mostly .yml files
        const { stdout } = await execAsync('dir /s /b *.yml | find /c /v ""', { cwd: rulesDir });
        const ruleCount = parseInt(stdout.trim()) || 0;

        return {
            isDownloaded: true,
            downloadedAt: stats.mtime.toISOString(),
            ruleCount: ruleCount
        };
    } catch {
        return { isDownloaded: true, error: 'Could not determine rule count' };
    }
}
