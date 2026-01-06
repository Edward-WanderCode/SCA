/**
 * Topic Manager for Telegram Forum
 * Manages topic information and validation
 * Now uses unified telegram-topics.json file
 */

import fs from 'fs/promises';
import path from 'path';

const TOPICS_FILE = path.join(process.cwd(), '.sca-data', 'telegram-topics.json');

interface TopicInfo {
    threadId: number;
    name: string;
    chatId: string | number;
    projectName?: string;
    lastUpdated: number;
}

interface TopicsData {
    mappings: { [projectName: string]: number }; // For backward compatibility
    topics: { [key: string]: TopicInfo }; // key: `${chatId}_${threadId}`
}

/**
 * Load topics data from unified file
 */
async function loadTopicsData(): Promise<TopicsData> {
    try {
        const data = await fs.readFile(TOPICS_FILE, 'utf-8');
        const parsed = JSON.parse(data);

        // Handle old format (just mappings)
        if (!parsed.mappings && !parsed.topics) {
            return {
                mappings: parsed, // Old format was just the mappings object
                topics: {}
            };
        }

        return parsed;
    } catch {
        return {
            mappings: {},
            topics: {}
        };
    }
}

/**
 * Save topics data to unified file
 */
async function saveTopicsData(data: TopicsData): Promise<void> {
    try {
        const dir = path.dirname(TOPICS_FILE);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(TOPICS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('[TopicManager] Failed to save topics data:', error);
    }
}

/**
 * Get cached topic name
 */
export async function getCachedTopicName(
    chatId: string | number,
    threadId: number
): Promise<string | null> {
    const data = await loadTopicsData();
    const key = `${chatId}_${threadId}`;
    const info = data.topics[key];

    if (info && Date.now() - info.lastUpdated < 24 * 60 * 60 * 1000) { // Cache for 24 hours
        return info.name;
    }

    return null;
}

/**
 * Cache topic information
 */
export async function cacheTopicInfo(
    chatId: string | number,
    threadId: number,
    name: string,
    projectName?: string
): Promise<void> {
    const data = await loadTopicsData();
    const key = `${chatId}_${threadId}`;

    data.topics[key] = {
        threadId,
        name,
        chatId,
        projectName,
        lastUpdated: Date.now()
    };

    await saveTopicsData(data);
}

/**
 * Save project to topic mapping (for backward compatibility)
 */
export async function saveProjectMapping(
    projectName: string,
    threadId: number
): Promise<void> {
    const data = await loadTopicsData();
    data.mappings[projectName] = threadId;
    await saveTopicsData(data);
}

/**
 * Get project mapping
 */
export async function getProjectMapping(projectName: string): Promise<number | null> {
    const data = await loadTopicsData();
    return data.mappings[projectName] || null;
}

/**
 * Delete project mapping and topic cache
 */
export async function deleteTopicInfo(
    projectName?: string,
    chatId?: string | number,
    threadId?: number
): Promise<void> {
    const data = await loadTopicsData();

    // Delete mapping
    if (projectName && data.mappings[projectName]) {
        delete data.mappings[projectName];
    }

    // Delete cache
    if (chatId && threadId) {
        const key = `${chatId}_${threadId}`;
        delete data.topics[key];
    }

    await saveTopicsData(data);
}

/**
 * Check if topic is allowed for file uploads
 */
export function isUploadAllowedInTopic(topicName: string | null | undefined): boolean {
    if (!topicName) return false;

    const ALLOWED_UPLOAD_TOPICS = [
        'Upload file ở đây',
        'Upload Files',
        'File Upload',
        'Uploads'
    ];

    return ALLOWED_UPLOAD_TOPICS.some(allowed =>
        allowed.toLowerCase() === topicName.toLowerCase()
    );
}

/**
 * Get allowed upload topics list
 */
export function getAllowedUploadTopics(): string[] {
    return [
        'Upload file ở đây',
        'Upload Files',
        'File Upload',
        'Uploads'
    ];
}

/**
 * Clear old cache entries (older than 30 days)
 */
export async function cleanupOldCache(): Promise<void> {
    try {
        const data = await loadTopicsData();
        const now = Date.now();
        const thirtyDays = 30 * 24 * 60 * 60 * 1000;

        let cleaned = false;
        for (const key in data.topics) {
            if (now - data.topics[key].lastUpdated > thirtyDays) {
                delete data.topics[key];
                cleaned = true;
            }
        }

        if (cleaned) {
            await saveTopicsData(data);
            console.log('[TopicManager] Cleaned up old cache entries');
        }
    } catch (error) {
        console.error('[TopicManager] Failed to cleanup cache:', error);
    }
}
