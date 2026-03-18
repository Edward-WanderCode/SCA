/**
 * Telegram Bot Polling Service
 */

import { loadTelegramConfig } from './telegram';
import { getScanById } from './db-helpers';
// Use static import for topic handling to ensure availability for command checks
import { getCachedTopicName } from './topic-manager';

// Use global to survive HMR/Fast Refresh
const globalPolling = global as any;

if (!globalPolling.__telegram_polling_state) {
    globalPolling.__telegram_polling_state = {
        isPolling: false,
        lastUpdateId: 0,
        processedUpdateIds: new Set<number>(),
        instanceId: Math.random().toString(36).substring(7)
    };
}

const state = globalPolling.__telegram_polling_state;
const PID = process.pid;

/**
 * Helper to add PID info for debugging double-process issues
 */
function wrapMessage(text: string) {
    return `${text}\n\n<pre>⚙️ PID: ${PID} | ID: ${state.instanceId}</pre>`;
}

async function handleTelegramUpdate(update: any) {
    try {
        if (state.processedUpdateIds.has(update.update_id)) return;
        state.processedUpdateIds.add(update.update_id);

        if (state.processedUpdateIds.size > 200) {
            const firstValue = state.processedUpdateIds.values().next().value;
            state.processedUpdateIds.delete(firstValue);
        }

        const config = await loadTelegramConfig();
        if (!config?.botToken) return;

        if (update.callback_query) {
            const cb = update.callback_query;
            const chatId = cb.message.chat.id;
            const messageThreadId = cb.message.message_thread_id; // Get topic ID from callback
            const username = cb.from?.username || cb.from?.first_name || 'User';

            await answerCallbackQuery(cb.id, config.botToken);

            if (cb.data.startsWith('status_')) {
                await handleStatusCommand(cb.data.replace('status_', ''), chatId, config.botToken, messageThreadId);
            } else if (cb.data === 'cmd_list') {
                await handleListScanCommand(chatId, config.botToken, messageThreadId);
            } else if (cb.data === 'cmd_help') {
                await handleHelpCommand(chatId, config.botToken, messageThreadId);
            } else if (cb.data === 'cmd_scan_info') {
                await sendTelegramMessage(chatId, config.botToken, "🚀 <b>Cách quét:</b>\n\nGửi lệnh <code>/scan</code> kèm theo URL repository.\n\nVí dụ:\n<code>/scan https://github.com/user/repo.git</code>", messageThreadId);
            } else if (cb.data.startsWith('rescan_')) {
                const scanId = cb.data.replace('rescan_', '');
                await executeRescan(scanId, chatId, config.botToken, username, messageThreadId);
            } else if (cb.data.startsWith('delete_')) {
                const scanId = cb.data.replace('delete_', '');
                await executeDelete(scanId, chatId, config.botToken, messageThreadId);
            }
            return;
        }

        const msg = update.message;



        if (!msg?.text) return;

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const username = msg.from?.username || msg.from?.first_name || 'User';
        const messageThreadId = msg.message_thread_id; // Get topic ID if in a topic

        // Try to extract topic name from message metadata and cache it
        if (messageThreadId && msg.reply_to_message?.forum_topic_created?.name) {
            const topicName = msg.reply_to_message.forum_topic_created.name;
            const { cacheTopicInfo } = await import('./topic-manager');
            await cacheTopicInfo(chatId, messageThreadId, topicName);
        }

        console.log(`[PID:${PID}] Received: ${text}`);

        if (text.startsWith('/')) {
            await handleCommand(text, chatId, config.botToken, username, messageThreadId);
        }
    } catch (error) {
        console.error(`[PID:${PID}] Update Error:`, error);
    }
}

async function answerCallbackQuery(id: string, token: string) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: id }),
        });
    } catch (e) { }
}

/**
 * Get forum topic info from Telegram API
 */
async function getForumTopicInfo(chatId: number | string, messageThreadId: number, token: string): Promise<string | null> {
    try {
        // Unfortunately, Telegram Bot API doesn't have a direct method to get topic info by thread ID
        // We need to use getChat and parse the result, or rely on message metadata
        // For now, we'll return null and rely on caching from message metadata
        return null;
    } catch (e) {
        return null;
    }
}

async function handleHelpCommand(chatId: number | string, token: string, messageThreadId?: number) {
    const keyboard = [
        [{ text: '📊 Bắt Đầu Quét Mới', callback_data: 'cmd_scan_info' }],
        [{ text: '📋 Xem Lịch Sử Quét', callback_data: 'cmd_list' }],
        [{ text: '❓ Hướng Dẫn Lệnh', callback_data: 'cmd_help' }]
    ];

    await sendTelegramMessageWithKeyboard(chatId, token, `👋 <b>SCA Platform Bot</b>

Chào mừng bạn đến với trợ lý phân tích bảo mật mã nguồn. Sử dụng các nút bên dưới hoặc gõ lệnh trực tiếp.

📊 <b>/scan</b> - Bắt đầu quét mới

📋 <b>/listscan</b> - Hiển thị danh sách quét
🔍 <b>/status</b> - Theo dõi tiến trình
🔄 <b>/rescan</b> - Quét lại và so sánh thay đổi
🗑️ <b>/delete</b> - Xóa một lần quét và topic
📋 <b>/help</b> - Hiển thị tin nhắn này
`, keyboard, messageThreadId);
}

async function handleListScanCommand(chatId: number | string, token: string, messageThreadId?: number) {
    try {
        const { getRecentScans } = await import('./db-helpers');
        const scans = await getRecentScans(10);
        if (scans.length === 0) {
            await sendTelegramMessage(chatId, token, '📋 Chưa có lượt quét nào.', messageThreadId);
            return;
        }
        const keyboard = scans.map((s: any) => [{
            text: `${s.status === 'completed' ? '✅' : '⏳'} ${s.sourceName}`,
            callback_data: `status_${s.id}`
        }]);
        await sendTelegramMessageWithKeyboard(chatId, token, '📋 <b>Danh sách quét gần đây:</b>', keyboard, messageThreadId);
    } catch (e) { }
}

async function handleStatusCommand(scanId: string, chatId: number | string, token: string, messageThreadId?: number) {
    try {
        const scanData = await getScanById(scanId);
        if (!scanData) {
            await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan: ${scanId}`, messageThreadId);
            return;
        }

        const status = scanData.status || 'unknown';
        const projectName = scanData.source?.name || 'Unknown';
        const timestamp = new Date(scanData.timestamp).toLocaleString();

        let emoji = status === 'completed' ? '✅' : (status === 'running' ? '🔄' : '❌');

        let message = `${emoji} <b>Trạng Thái Quét</b>\n\n`;
        message += `🆔 ID: <code>${scanId}</code>\n`;
        message += `📁 Dự án: <b>${projectName}</b>\n`;
        message += `📅 Bắt đầu: ${timestamp}\n`;
        message += `📊 Trạng thái: <b>${status}</b>\n\n`;

        if (status === 'completed') {
            const findings = scanData.findings || [];
            message += `📋 <b>Kết quả:</b> ${findings.length} lỗi\n`;
        } else if (status === 'running') {
            const progress = (scanData as any).lastProgress || 0;
            const stage = (scanData as any).lastStage || 'Processing...';

            // Generate progress bar
            const filled = Math.floor(progress / 10);
            const empty = 10 - filled;
            const bar = '▓'.repeat(filled) + '░'.repeat(empty);

            message += `⏳ <b>Tiến độ: ${progress}%</b>\n`;
            message += `[${bar}]\n`;
            message += `🔄 Giai đoạn: ${stage}`;
        }

        await sendTelegramMessage(chatId, token, message, messageThreadId);
    } catch (error) { }
}

/**
 * Wrapper for /status command - handles both with and without scanId parameter
 */
async function handleStatusCommandWrapper(args: string[], chatId: number | string, token: string, messageThreadId?: number) {
    try {
        let scanId: string | undefined;

        // If scanId is provided as argument, use it
        if (args[0]) {
            scanId = args[0];
        }
        // Otherwise, try to find the scan for this topic
        else if (messageThreadId) {
            const { prisma } = await import('./prisma');
            const scanData = await prisma.scan.findFirst({
                where: {
                    telegramChatId: chatId.toString(),
                    telegramThreadId: messageThreadId,
                },
                orderBy: {
                    timestamp: 'desc' // Get the latest scan for this topic
                }
            });

            if (scanData) {
                scanId = scanData.id;
            }
        }

        if (!scanId) {
            await sendTelegramMessage(
                chatId,
                token,
                `❌ Không tìm thấy scan nào cho topic này.\n\n💡 Sử dụng: /status <scan_id> hoặc gọi lệnh trong topic của project.`,
                messageThreadId
            );
            return;
        }

        await handleStatusCommand(scanId, chatId, token, messageThreadId);
    } catch (error: any) {
        console.error('Status command wrapper error:', error);
        await sendTelegramMessage(chatId, token, `❌ Lỗi: ${error.message}`, messageThreadId);
    }
}

async function handleCommand(text: string, chatId: number | string, token: string, user: string, messageThreadId?: number) {
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Get topic name - try cache first
    let topicName: string | null = null;
    if (messageThreadId) {
        topicName = await getCachedTopicName(chatId, messageThreadId);
    }

    // Check specific rules
    const botCommands = ['/help', '/scan', '/listscan']; // Removed /status from here
    const isBotCommandTopic = topicName === 'Bot Command';
    const isProjectTopic = topicName && topicName !== 'Bot Command';

    if (botCommands.includes(command) || command === '/start') {
        // Rule 1: Only "Bot Command" topic can call these
        // IMPORTANT: If topicName is null (unknown/not cached), ALLOW the command
        // This handles the case when Bot Command topic is newly created
        // Only BLOCK if we KNOW the topic name and it's NOT "Bot Command"
        if (messageThreadId && topicName !== null && !isBotCommandTopic) {
            console.log(`[Command] Blocked ${command} in topic: ${topicName}`);
            return;
        }
    }

    // Rule 2: /status can be called in both Bot Command topic and Project topics
    if (command === '/status') {
        // Allow in Bot Command topic or any Project topic
        // Block only if we're in a topic that's neither Bot Command nor a Project
        if (messageThreadId && topicName !== null && !isBotCommandTopic && !isProjectTopic) {
            console.log(`[Command] Blocked /status in topic: ${topicName}`);
            return;
        }
    }

    // Rule 3: Only Bot Created Project Topics can call /rescan
    if (command === '/rescan') {
        // Project topic must be known (cached) and NOT 'Bot Command'
        // If topicName is null (unknown), block rescan for safety
        if (messageThreadId && !isProjectTopic) {
            console.log(`[Command] Blocked /rescan in topic: ${topicName || 'unknown'}`);
            return;
        }
    }

    switch (command) {
        case '/start':
        case '/help':
            await handleHelpCommand(chatId, token, messageThreadId);
            break;

        case '/listscan':
            await handleListScanCommand(chatId, token, messageThreadId);
            break;

        case '/scan':
            if (args.length === 0) {
                await sendTelegramMessage(chatId, token, '❌ Thiếu URL. VD: /scan https://github.com/...', messageThreadId);
                return;
            }
            await sendTelegramMessage(chatId, token, `🚀 Đang khởi tạo quét...`, messageThreadId);
            const res = await triggerScan(args[0], chatId, user);
            if (res.success) {
                await sendTelegramMessage(chatId, token, `✅ Đã bắt đầu! ID: <code>${res.scanId}</code>`, messageThreadId);
            } else {
                await sendTelegramMessage(chatId, token, `❌ Lỗi: ${res.error}`, messageThreadId);
            }
            break;

        case '/status':
            await handleStatusCommandWrapper(args, chatId, token, messageThreadId);
            break;

        case '/delete':
            await handleDeleteCommand(text, chatId, token, messageThreadId);
            break;

        case '/rescan':
            await handleRescanCommand(text, chatId, token, user, messageThreadId);
            break;

        default:
            break;
    }
}

// Unified Delete Logic
async function executeDelete(scanId: string, chatId: number | string, token: string, messageThreadId?: number) {
    try {
        const { prisma } = await import('./prisma');
        const { deleteForumTopic } = await import('./telegram');

        const scanData = await prisma.scan.findUnique({
            where: { id: scanId },
        });

        if (!scanData) {
            await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan: ${scanId}`, messageThreadId);
            return;
        }

        if (scanData.telegramThreadId && scanData.telegramChatId) {
            const deleteResult = await deleteForumTopic(
                scanData.telegramChatId,
                scanData.telegramThreadId,
                scanData.sourceName
            );

            if (!deleteResult.success) {
                console.warn('Could not delete topic:', deleteResult.error);
            }
        }

        await prisma.scan.delete({
            where: { id: scanData.id },
        });

        if (messageThreadId !== scanData.telegramThreadId) {
            await sendTelegramMessage(chatId, token, `✅ Đã xóa scan ${scanData.id} và topic thành công!`, messageThreadId);
        }
    } catch (error: any) {
        console.error('Delete command error:', error);
        await sendTelegramMessage(chatId, token, `❌ Lỗi: ${error.message}`, messageThreadId);
    }
}

async function handleDeleteCommand(text: string, chatId: number | string, token: string, messageThreadId?: number) {
    const { prisma } = await import('./prisma');
    const parts = text.trim().split(/\s+/);

    let scanId;

    if (messageThreadId) {
        const scanData = await prisma.scan.findFirst({
            where: {
                telegramChatId: chatId.toString(),
                telegramThreadId: messageThreadId,
            },
        });
        if (scanData) scanId = scanData.id;
    }

    if (!scanId && parts.length >= 2) {
        scanId = parts[1];
    }

    if (!scanId) {
        await sendTelegramMessage(chatId, token, `❌ Vui lòng cung cấp Scan ID hoặc dùng lệnh trong topic dự án.\n\nVí dụ: /delete scan_abc123`, messageThreadId);
        return;
    }

    await executeDelete(scanId, chatId, token, messageThreadId);
}

// Unified Rescan Logic
async function executeRescan(scanId: string, chatId: number | string, token: string, user: string, messageThreadId?: number) {
    try {
        const { prisma } = await import('./prisma');

        const oldScan = await prisma.scan.findUnique({
            where: { id: scanId },
            include: { findings: true },
        });

        if (!oldScan) {
            await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan: ${scanId}`, messageThreadId);
            return;
        }

        if (!oldScan.sourceUrl) {
            await sendTelegramMessage(chatId, token, `❌ Scan này không có URL để rescan. Chỉ có thể rescan các scan từ Git.`, messageThreadId);
            return;
        }

        await sendTelegramMessage(chatId, token, `🚀 Đang khởi tạo rescan cho:\n📁 ${oldScan.sourceName}\n🔗 ${oldScan.sourceUrl}`, messageThreadId);

        const res = await triggerScan(oldScan.sourceUrl, chatId, user, oldScan.id, oldScan.telegramThreadId);

        if (res.success) {
            const oldFindings = oldScan.criticalCount + oldScan.highCount + oldScan.mediumCount + oldScan.lowCount + oldScan.infoCount;
            await sendTelegramMessage(
                chatId,
                token,
                `✅ Đã bắt đầu rescan!\n\n📊 Scan cũ: ${oldFindings} lỗi\n🆔 Scan mới: <code>${res.scanId}</code>\n\n⏳ Đang so sánh...`,
                messageThreadId
            );
        } else {
            await sendTelegramMessage(chatId, token, `❌ Lỗi: ${res.error}`, messageThreadId);
        }
    } catch (error: any) {
        console.error('Rescan command error:', error);
        await sendTelegramMessage(chatId, token, `❌ Lỗi: ${error.message}`, messageThreadId);
    }
}

async function handleRescanCommand(text: string, chatId: number | string, token: string, user: string, messageThreadId?: number) {
    const { prisma } = await import('./prisma');
    const parts = text.trim().split(/\s+/);

    let scanId;

    if (messageThreadId) {
        const oldScan = await prisma.scan.findFirst({
            where: {
                telegramChatId: chatId.toString(),
                telegramThreadId: messageThreadId,
            },
        });
        if (oldScan) scanId = oldScan.id;
    }

    if (!scanId && parts.length >= 2) {
        scanId = parts[1];
    }

    if (!scanId) {
        await sendTelegramMessage(chatId, token, `❌ Vui lòng cung cấp Scan ID hoặc dùng lệnh trong topic dự án.`, messageThreadId);
        return;
    }

    await executeRescan(scanId, chatId, token, user, messageThreadId);
}





async function sendTelegramMessage(chatId: number | string, token: string, text: string, messageThreadId?: number) {
    try {
        const body: any = {
            chat_id: chatId,
            text: wrapMessage(text),
            parse_mode: 'HTML'
        };

        if (messageThreadId) {
            body.message_thread_id = messageThreadId;
        }

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (e) { }
}

async function sendTelegramMessageWithKeyboard(chatId: number | string, token: string, text: string, keyboard: any[], messageThreadId?: number) {
    try {
        const body: any = {
            chat_id: chatId,
            text: wrapMessage(text),
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: keyboard }
        };

        if (messageThreadId) {
            body.message_thread_id = messageThreadId;
        }

        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (e) { }
}

async function triggerScan(url: string, chatId: number | string, user: string, compareWithId?: string, telegramThreadId?: number | null) {
    try {
        const body: any = {
            method: 'git',
            url,
            metadata: { telegramChatId: chatId, triggeredBy: user }
        };

        if (compareWithId) {
            body.compareWithId = compareWithId;
        }

        // Pass telegramThreadId to reuse the same topic for rescans
        if (telegramThreadId) {
            body.metadata.telegramThreadId = telegramThreadId;
        }

        const res = await fetch('http://localhost:3000/api/scan/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return await res.json();
    } catch (e: any) { return { success: false, error: e.message }; }
}

async function pollTelegram() {
    if (!state.isPolling) return;
    try {
        const config = await loadTelegramConfig();
        if (!config?.enabled || !config?.botToken) return;

        const res = await fetch(`https://api.telegram.org/bot${config.botToken}/getUpdates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                offset: state.lastUpdateId + 1,
                timeout: 30,
                allowed_updates: ['message', 'callback_query']
            }),
        });

        const result = await res.json();
        if (result.ok && result.result.length > 0) {
            for (const update of result.result) {
                if (update.update_id > state.lastUpdateId) {
                    await handleTelegramUpdate(update);
                    state.lastUpdateId = update.update_id;
                }
            }
        }
    } catch (e) {
        console.error(`[PID:${PID}] Poll Error:`, e);
    }
}

export function startTelegramPolling(intervalMs: number = 2000) {
    if (state.isPolling) {
        console.log(`[PID:${PID}] Polling already active.`);
        return;
    }
    console.log(`[PID:${PID}] Starting Polling Loop...`);
    state.isPolling = true;

    const loop = async () => {
        if (!state.isPolling) return;
        await pollTelegram();
        setTimeout(loop, intervalMs);
    };
    loop();
}

export function stopTelegramPolling() {
    console.log(`[PID:${PID}] Stopping Polling...`);
    state.isPolling = false;
}

export function isPollingActive(): boolean {
    return state.isPolling;
}
