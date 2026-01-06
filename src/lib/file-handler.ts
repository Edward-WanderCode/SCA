/**
 * File Handler for Telegram Bot
 * Handles downloading and extracting RAR/ZIP files
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

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
 * Download file from Telegram
 */
export async function downloadTelegramFile(
    fileId: string,
    botToken: string,
    originalFileName: string
): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
        // Get file path from Telegram
        const fileInfoResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
        );
        const fileInfo = await fileInfoResponse.json();

        if (!fileInfo.ok) {
            return { success: false, error: 'Failed to get file info from Telegram' };
        }

        const filePath = fileInfo.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        // Download file
        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok) {
            return { success: false, error: 'Failed to download file from Telegram' };
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
 * Extract archive file (RAR or ZIP)
 */
export async function extractArchive(
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
