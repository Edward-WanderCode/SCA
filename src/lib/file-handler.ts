/**
 * File Handler for Telegram Bot
 * Handles downloading and extracting RAR/ZIP files
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { downloadFileFromMessage, isGramJSConfigured } from './telegram-client';

const execAsync = promisify(exec);

const DOWNLOAD_DIR = path.join(process.cwd(), 'Download');

/**
 * Ensure download directory exists
 */
export async function ensureDownloadDir(): Promise<string> {
    try {
        await fs.access(DOWNLOAD_DIR);
    } catch {
        await fs.mkdir(DOWNLOAD_DIR, { recursive: true });
        console.log(`[FileHandler] Created download directory: ${DOWNLOAD_DIR}`);
    }
    return DOWNLOAD_DIR;
}

/**
 * Download file from Telegram using GramJS (supports files >20MB up to 2GB)
 * This is the PREFERRED method for large files
 */
export async function downloadTelegramFileWithGramJS(
    chatId: number | string,
    messageId: number,
    originalFileName: string,
    fileSize?: number
): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
        // Check if GramJS is configured
        if (!isGramJSConfigured()) {
            return {
                success: false,
                error: 'GramJS not configured. Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env.local\n\nGet credentials from: https://my.telegram.org'
            };
        }

        console.log(`[FileHandler] Downloading with GramJS: ${originalFileName} (${fileSize || 'unknown'} bytes)`);

        // Download using GramJS
        const result = await downloadFileFromMessage(
            chatId,
            messageId,
            (downloaded, total) => {
                const percent = total > 0 ? ((downloaded / total) * 100).toFixed(1) : '0';
                console.log(`[FileHandler] Download progress: ${percent}%`);
            }
        );

        if (!result.success || !result.buffer) {
            return { success: false, error: result.error || 'Download failed' };
        }

        // Save file to Download directory
        await ensureDownloadDir();
        const timestamp = Date.now();
        const fileName = result.fileName || originalFileName;
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const localFilePath = path.join(DOWNLOAD_DIR, `${timestamp}_${sanitizedFileName}`);

        await fs.writeFile(localFilePath, result.buffer);
        console.log(`[FileHandler] Downloaded file with GramJS: ${localFilePath}`);

        return { success: true, filePath: localFilePath };
    } catch (error: any) {
        console.error('[FileHandler] GramJS download error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Download file from Telegram (Bot API - limited to 20MB)
 * For files >20MB, use downloadTelegramFileWithGramJS instead
 */
export async function downloadTelegramFile(
    fileId: string,
    botToken: string,
    originalFileName: string,
    fileSize?: number
): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
        // Telegram Bot API limit: 20 MB
        const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB in bytes

        if (fileSize && fileSize > MAX_FILE_SIZE) {
            const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
            return {
                success: false,
                error: `File quá lớn (${sizeMB} MB). Bot API chỉ hỗ trợ ≤ 20 MB.\n\n💡 Hệ thống sẽ tự động chuyển sang GramJS để tải file này.`
            };
        }

        // Get file path from Telegram
        const fileInfoResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
        );
        const fileInfo = await fileInfoResponse.json();

        if (!fileInfo.ok) {
            // Check if error is due to file size
            if (fileInfo.description && fileInfo.description.includes('too large')) {
                return {
                    success: false,
                    error: 'File quá lớn. Bot API chỉ hỗ trợ ≤ 20 MB.\n\n💡 Hệ thống sẽ tự động chuyển sang GramJS.'
                };
            }
            return { success: false, error: `Lỗi Telegram API: ${fileInfo.description || 'Failed to get file info'}` };
        }

        // Double-check file size from API response
        const apiFileSize = fileInfo.result.file_size;
        if (apiFileSize && apiFileSize > MAX_FILE_SIZE) {
            const sizeMB = (apiFileSize / (1024 * 1024)).toFixed(2);
            return {
                success: false,
                error: `File quá lớn (${sizeMB} MB). Giới hạn: 20 MB`
            };
        }

        const filePath = fileInfo.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        // Download file
        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok) {
            return { success: false, error: `Lỗi tải file: HTTP ${fileResponse.status}` };
        }

        const buffer = await fileResponse.arrayBuffer();

        // Save file to Download directory
        await ensureDownloadDir();
        const timestamp = Date.now();
        const sanitizedFileName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const localFilePath = path.join(DOWNLOAD_DIR, `${timestamp}_${sanitizedFileName}`);

        await fs.writeFile(localFilePath, Buffer.from(buffer));
        console.log(`[FileHandler] Downloaded file: ${localFilePath}`);

        return { success: true, filePath: localFilePath };
    } catch (error: any) {
        console.error('[FileHandler] Download error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Extract RAR file using WinRAR
 */
async function extractRar(filePath: string, extractPath: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Try common WinRAR installation paths
        const unrarPaths = [
            'C:\\Program Files\\WinRAR\\UnRAR.exe',
            'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe',
            'unrar' // If in PATH
        ];

        let unrarPath = '';
        for (const p of unrarPaths) {
            try {
                if (p.includes('\\')) {
                    await fs.access(p);
                }
                unrarPath = p;
                break;
            } catch {
                continue;
            }
        }

        if (!unrarPath) {
            return { success: false, error: 'WinRAR/UnRAR not found. Please install WinRAR.' };
        }

        // Extract using UnRAR
        const command = `"${unrarPath}" x -o+ "${filePath}" "${extractPath}\\"`;
        await execAsync(command);

        return { success: true };
    } catch (error: any) {
        console.error('[FileHandler] RAR extraction error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Extract ZIP file using PowerShell
 */
async function extractZip(filePath: string, extractPath: string): Promise<{ success: boolean; error?: string }> {
    try {
        // Use PowerShell's Expand-Archive
        const command = `powershell -command "Expand-Archive -Path '${filePath}' -DestinationPath '${extractPath}' -Force"`;
        await execAsync(command);

        return { success: true };
    } catch (error: any) {
        console.error('[FileHandler] ZIP extraction error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Find all archive files in a directory recursively
 */
async function findArchives(dirPath: string): Promise<string[]> {
    const archives: string[] = [];

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively search subdirectories
                const subArchives = await findArchives(fullPath);
                archives.push(...subArchives);
            } else if (entry.isFile() && isSupportedArchive(entry.name)) {
                archives.push(fullPath);
            }
        }
    } catch (error) {
        console.error(`[FileHandler] Error scanning directory ${dirPath}:`, error);
    }

    return archives;
}

/**
 * Extract archive file (RAR or ZIP) - single level
 */
async function extractArchiveSingle(
    filePath: string
): Promise<{ success: boolean; extractPath?: string; error?: string }> {
    try {
        const ext = path.extname(filePath).toLowerCase();
        const fileNameWithoutExt = path.basename(filePath, ext);
        const extractPath = path.join(path.dirname(filePath), fileNameWithoutExt);

        // Create extraction directory
        await fs.mkdir(extractPath, { recursive: true });

        let result;
        if (ext === '.rar') {
            result = await extractRar(filePath, extractPath);
        } else if (ext === '.zip') {
            result = await extractZip(filePath, extractPath);
        } else {
            return { success: false, error: `Unsupported file format: ${ext}` };
        }

        if (!result.success) {
            return { success: false, error: result.error };
        }

        console.log(`[FileHandler] Extracted to: ${extractPath}`);
        return { success: true, extractPath };
    } catch (error: any) {
        console.error('[FileHandler] Extraction error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Extract archive file with recursive extraction of nested archives
 * @param filePath Path to the archive file
 * @param maxDepth Maximum recursion depth (default: 3)
 * @param maxArchives Maximum number of archives to extract (safety limit, default: 50)
 */
export async function extractArchive(
    filePath: string,
    maxDepth: number = 3,
    maxArchives: number = 50
): Promise<{
    success: boolean;
    extractPath?: string;
    error?: string;
    stats?: {
        totalExtracted: number;
        nestedArchives: number;
        maxDepthReached: number;
    }
}> {
    const stats = {
        totalExtracted: 0,
        nestedArchives: 0,
        maxDepthReached: 0
    };

    try {
        // Extract the main archive
        const mainResult = await extractArchiveSingle(filePath);
        if (!mainResult.success || !mainResult.extractPath) {
            return { success: false, error: mainResult.error };
        }

        stats.totalExtracted = 1;
        const extractPath = mainResult.extractPath;

        // Now recursively extract nested archives
        await extractNestedArchives(extractPath, 1, maxDepth, maxArchives, stats);

        console.log(`[FileHandler] Recursive extraction complete:`, stats);

        return {
            success: true,
            extractPath,
            stats
        };
    } catch (error: any) {
        console.error('[FileHandler] Recursive extraction error:', error);
        return { success: false, error: error.message, stats };
    }
}

/**
 * Recursively extract nested archives
 */
async function extractNestedArchives(
    dirPath: string,
    currentDepth: number,
    maxDepth: number,
    maxArchives: number,
    stats: { totalExtracted: number; nestedArchives: number; maxDepthReached: number }
): Promise<void> {
    // Update max depth reached
    if (currentDepth > stats.maxDepthReached) {
        stats.maxDepthReached = currentDepth;
    }

    // Check depth limit
    if (currentDepth > maxDepth) {
        console.log(`[FileHandler] Max depth ${maxDepth} reached, stopping recursion`);
        return;
    }

    // Check archive limit
    if (stats.totalExtracted >= maxArchives) {
        console.warn(`[FileHandler] Max archives limit ${maxArchives} reached, stopping extraction`);
        return;
    }

    // Find all archives in current directory
    const archives = await findArchives(dirPath);

    if (archives.length === 0) {
        return; // No nested archives found
    }

    console.log(`[FileHandler] Found ${archives.length} nested archive(s) at depth ${currentDepth}`);
    stats.nestedArchives += archives.length;

    // Extract each archive
    for (const archivePath of archives) {
        if (stats.totalExtracted >= maxArchives) {
            console.warn(`[FileHandler] Reached max archives limit during extraction`);
            break;
        }

        console.log(`[FileHandler] Extracting nested archive [depth ${currentDepth}]: ${path.basename(archivePath)}`);

        const result = await extractArchiveSingle(archivePath);

        if (result.success && result.extractPath) {
            stats.totalExtracted++;

            // Recursively extract from the newly extracted folder
            await extractNestedArchives(
                result.extractPath,
                currentDepth + 1,
                maxDepth,
                maxArchives,
                stats
            );

            // Optionally delete the archive file after extraction
            try {
                await fs.unlink(archivePath);
                console.log(`[FileHandler] Deleted extracted archive: ${path.basename(archivePath)}`);
            } catch (err) {
                console.warn(`[FileHandler] Could not delete archive ${archivePath}:`, err);
            }
        } else {
            console.warn(`[FileHandler] Failed to extract nested archive: ${archivePath}`, result.error);
        }
    }
}

/**
 * Check if file is a supported archive
 */
export function isSupportedArchive(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return ext === '.rar' || ext === '.zip';
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
