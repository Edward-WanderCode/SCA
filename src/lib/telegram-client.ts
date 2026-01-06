/**
 * GramJS Telegram Client
 * Provides MTProto-based client for downloading large files (>20MB)
 */

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { Api } from "telegram/tl";

// Configuration - You need to get these from https://my.telegram.org
const API_ID = parseInt(process.env.TELEGRAM_API_ID || "0");
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Session storage - persists login state
const SESSION_STRING = process.env.TELEGRAM_SESSION || "";

let clientInstance: TelegramClient | null = null;
let isConnecting = false;

/**
 * Get or create a connected Telegram client
 */
export async function getTelegramClient(): Promise<TelegramClient> {
    // Return existing connected client
    if (clientInstance && clientInstance.connected) {
        return clientInstance;
    }

    // Wait if another request is connecting
    if (isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getTelegramClient();
    }

    try {
        isConnecting = true;

        // Validate configuration
        if (!API_ID || !API_HASH || !BOT_TOKEN) {
            throw new Error(
                'Missing configuration. Please set TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_BOT_TOKEN in .env.local\n\n' +
                'Get API credentials from: https://my.telegram.org'
            );
        }

        console.log('[TelegramClient] Initializing GramJS client...');

        const session = new StringSession(SESSION_STRING);
        clientInstance = new TelegramClient(session, API_ID, API_HASH, {
            connectionRetries: 5,
            useWSS: false,
        });

        // Start the client with bot authentication
        await clientInstance.start({
            botAuthToken: BOT_TOKEN,
        });

        console.log('[TelegramClient] Successfully connected!');

        // Save session string for next time (optional - log it once to save to .env)
        const sessionString = clientInstance.session.save();
        if (!SESSION_STRING && sessionString) {
            console.log('[TelegramClient] Save this session to .env.local as TELEGRAM_SESSION:');
            console.log(sessionString);
        }

        return clientInstance;
    } catch (error: any) {
        console.error('[TelegramClient] Connection error:', error);
        throw error;
    } finally {
        isConnecting = false;
    }
}

/**
 * Disconnect the client
 */
export async function disconnectTelegramClient() {
    if (clientInstance) {
        await clientInstance.disconnect();
        clientInstance = null;
        console.log('[TelegramClient] Disconnected');
    }
}

/**
 * Download a file from Telegram using GramJS (supports files >20MB up to 2GB)
 */
export async function downloadFileWithGramJS(
    fileId: string,
    originalFileName: string,
    progressCallback?: (downloaded: number, total: number) => void
): Promise<{ success: boolean; buffer?: Buffer; error?: string }> {
    try {
        const client = await getTelegramClient();

        // Convert file_id to InputFileLocation
        // Note: GramJS requires different approach than Bot API
        // We need to get the document from a message first
        console.log('[TelegramClient] Attempting to download file:', originalFileName);

        // Unfortunately, GramJS can't directly convert Bot API file_id to InputFileLocation
        // We need to receive the file through a message update
        // This is a limitation we'll document

        return {
            success: false,
            error: 'GramJS requires message context to download files. Please use downloadFileFromMessage() instead.'
        };

    } catch (error: any) {
        console.error('[TelegramClient] Download error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Download file from a Telegram message (preferred method for GramJS)
 * This works with the message object directly, not just file_id
 */
export async function downloadFileFromMessage(
    chatId: number | string,
    messageId: number,
    progressCallback?: (downloaded: number, total: number) => void
): Promise<{ success: boolean; buffer?: Buffer; fileName?: string; error?: string }> {
    try {
        console.log(`[TelegramClient] Starting download for message ${messageId} from chat ${chatId}`);

        // Check configuration first
        if (!isGramJSConfigured()) {
            const error = '❌ GramJS chưa được cấu hình!\n\n' +
                '📝 Tạo file .env.local với nội dung:\n' +
                'TELEGRAM_API_ID=your_api_id\n' +
                'TELEGRAM_API_HASH=your_api_hash\n\n' +
                '🔗 Lấy credentials tại: https://my.telegram.org';
            console.error('[TelegramClient] Configuration missing:', error);
            return { success: false, error };
        }

        const client = await getTelegramClient();

        console.log(`[TelegramClient] Fetching message ${messageId} from chat ${chatId}`);

        // Get the message
        const messages = await client.getMessages(chatId, {
            ids: [messageId]
        });

        if (!messages || messages.length === 0) {
            console.error('[TelegramClient] Message not found');
            return { success: false, error: 'Message not found' };
        }

        const message = messages[0];

        // Check if message has media
        if (!message.media) {
            console.error('[TelegramClient] Message does not contain media');
            return { success: false, error: 'Message does not contain media' };
        }

        // Get file information
        let fileName = 'unknown';
        let fileSize = 0;

        if (message.media instanceof Api.MessageMediaDocument && message.media.document instanceof Api.Document) {
            const doc = message.media.document;
            const size = doc.size;
            fileSize = typeof size === 'bigint' ? Number(size) : (typeof size === 'number' ? size : 0);

            // Get filename from attributes
            for (const attr of doc.attributes) {
                if (attr instanceof Api.DocumentAttributeFilename) {
                    fileName = attr.fileName;
                    break;
                }
            }
        }

        if (fileSize === 0) {
            console.warn('[TelegramClient] Warning: File size is 0, download may fail');
        }

        console.log(`[TelegramClient] Downloading file: ${fileName} (${fileSize} bytes)`);

        // Download the media
        const buffer = await client.downloadMedia(message, {
            progressCallback: (downloaded, total) => {
                // Convert BigInt to number if needed
                let downloadedNum: number;
                let totalNum: number;

                if (typeof downloaded === 'bigint') {
                    downloadedNum = Number(downloaded);
                } else if (typeof downloaded === 'number') {
                    downloadedNum = downloaded;
                } else {
                    downloadedNum = 0;
                }

                if (typeof total === 'bigint') {
                    totalNum = Number(total);
                } else if (typeof total === 'number') {
                    totalNum = total;
                } else {
                    totalNum = 0;
                }

                if (progressCallback) {
                    progressCallback(downloadedNum, totalNum);
                }

                // Log progress (only if we have meaningful data)
                if (totalNum > 0) {
                    const percent = ((downloadedNum / totalNum) * 100).toFixed(1);
                    console.log(`[TelegramClient] Progress: ${percent}% (${downloadedNum}/${totalNum})`);
                } else if (downloadedNum > 0) {
                    // Show bytes downloaded even if total is unknown
                    console.log(`[TelegramClient] Downloaded: ${downloadedNum} bytes`);
                }
            }
        });

        if (!buffer) {
            console.error('[TelegramClient] Download failed - no buffer returned');
            return { success: false, error: 'Download failed - no buffer returned' };
        }

        console.log(`[TelegramClient] Successfully downloaded ${fileName} (${Buffer.from(buffer).length} bytes)`);

        return {
            success: true,
            buffer: Buffer.from(buffer),
            fileName
        };

    } catch (error: any) {
        console.error('[TelegramClient] Download from message error:', error);

        // Provide more helpful error messages
        let errorMessage = error.message;
        if (error.message.includes('API_ID')) {
            errorMessage = '❌ Lỗi cấu hình API_ID. Kiểm tra .env.local';
        } else if (error.message.includes('AUTH')) {
            errorMessage = '❌ Lỗi xác thực. Kiểm tra TELEGRAM_BOT_TOKEN';
        }

        return { success: false, error: errorMessage };
    }
}

/**
 * Check if GramJS is properly configured
 */
export function isGramJSConfigured(): boolean {
    return !!(API_ID && API_HASH && BOT_TOKEN);
}
