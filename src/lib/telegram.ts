import fs from 'fs/promises';
import path from 'path';

export interface TelegramConfig {
    botToken: string;
    chatId: string;
    enabled: boolean;
}

const CONFIG_FILE = path.join(process.cwd(), '.sca-data', 'telegram-config.json');

/**
 * Load Telegram configuration from file
 */
export async function loadTelegramConfig(): Promise<TelegramConfig | null> {
    try {
        const content = await fs.readFile(CONFIG_FILE, 'utf-8');
        return JSON.parse(content);
    } catch {
        return null;
    }
}

/**
 * Save Telegram configuration to file
 */
export async function saveTelegramConfig(config: TelegramConfig): Promise<void> {
    const dataDir = path.join(process.cwd(), '.sca-data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Send a PDF file to Telegram chat
 */
export async function sendPdfToTelegram(
    pdfBuffer: Buffer,
    fileName: string,
    caption: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const config = await loadTelegramConfig();

        if (!config || !config.enabled) {
            return { success: false, error: 'Telegram notifications are disabled' };
        }

        if (!config.botToken || !config.chatId) {
            return { success: false, error: 'Telegram configuration is incomplete' };
        }

        // Create FormData for multipart/form-data request
        const formData = new FormData();

        // Create a Blob from the buffer (convert to Uint8Array for compatibility)
        const uint8Array = new Uint8Array(pdfBuffer);
        const blob = new Blob([uint8Array], { type: 'application/pdf' });
        formData.append('document', blob, fileName);
        formData.append('chat_id', config.chatId);
        formData.append('caption', caption);
        formData.append('parse_mode', 'HTML');

        const url = `https://api.telegram.org/bot${config.botToken}/sendDocument`;

        const response = await fetch(url, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            return {
                success: false,
                error: result.description || 'Failed to send message to Telegram',
            };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Test Telegram connection
 */
export async function testTelegramConnection(
    botToken: string,
    chatId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: '✅ SCA Platform - Telegram connection test successful!',
            }),
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            return {
                success: false,
                error: result.description || 'Failed to connect to Telegram',
            };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
