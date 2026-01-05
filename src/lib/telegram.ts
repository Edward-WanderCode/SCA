import fs from 'fs/promises';
import path from 'path';

export interface TelegramConfig {
    botToken: string;
    chatId: string;
    enabled: boolean;
}

const CONFIG_FILE = path.join(process.cwd(), '.sca-data', 'telegram-config.json');
const TOPICS_FILE = path.join(process.cwd(), '.sca-data', 'telegram-topics.json');

interface TopicMapping {
    [projectName: string]: number;
}

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
    caption: string,
    messageThreadId?: number
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
        if (messageThreadId) {
            formData.append('message_thread_id', messageThreadId.toString());
        }

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

/**
 * Load Topic mappings from file
 */
async function loadTopicMappings(): Promise<TopicMapping> {
    try {
        const content = await fs.readFile(TOPICS_FILE, 'utf-8');
        return JSON.parse(content);
    } catch {
        return {};
    }
}

/**
 * Save Topic mapping to file
 */
async function saveTopicMapping(projectName: string, messageThreadId: number): Promise<void> {
    const mappings = await loadTopicMappings();
    mappings[projectName] = messageThreadId;
    const dataDir = path.join(process.cwd(), '.sca-data');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(TOPICS_FILE, JSON.stringify(mappings, null, 2), 'utf-8');
}

/**
 * Get or create a forum topic in a supergroup
 */
export async function getOrCreateForumTopic(
    name: string
): Promise<{ success: boolean; message_thread_id?: number; error?: string }> {
    try {
        // 1. Check if we already have a mapping for this project
        const mappings = await loadTopicMappings();
        if (mappings[name]) {
            console.log(`[Telegram] Reusing existing topic for ${name}: ${mappings[name]}`);
            return {
                success: true,
                message_thread_id: mappings[name]
            };
        }

        // 2. If not, create a new topic
        const config = await loadTelegramConfig();

        if (!config || !config.enabled) {
            return { success: false, error: 'Telegram notifications are disabled' };
        }

        if (!config.botToken || !config.chatId) {
            return { success: false, error: 'Telegram configuration is incomplete' };
        }

        const url = `https://api.telegram.org/bot${config.botToken}/createForumTopic`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: config.chatId,
                name: name,
            }),
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
            return {
                success: false,
                error: result.description || 'Failed to create forum topic',
            };
        }

        const messageThreadId = result.result.message_thread_id;

        // 3. Save the new mapping
        await saveTopicMapping(name, messageThreadId);

        return {
            success: true,
            message_thread_id: messageThreadId,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
