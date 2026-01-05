/**
 * Telegram Bot Polling Service
 */

import { loadTelegramConfig } from './telegram';
import { getScanById } from './db-helpers';

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

            await answerCallbackQuery(cb.id, config.botToken);

            if (cb.data.startsWith('status_')) {
                await handleStatusCommand(cb.data.replace('status_', ''), chatId, config.botToken);
            } else if (cb.data === 'cmd_list') {
                await handleListScanCommand(chatId, config.botToken);
            } else if (cb.data === 'cmd_help') {
                await handleHelpCommand(chatId, config.botToken);
            } else if (cb.data === 'cmd_scan_info') {
                await sendTelegramMessage(chatId, config.botToken, "🚀 <b>How to scan:</b>\n\nSend the <code>/scan</code> command followed by the repository URL.\n\nExample:\n<code>/scan https://github.com/user/repo.git</code>");
            }
            return;
        }

        const msg = update.message;
        if (!msg?.text) return;

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const username = msg.from?.username || msg.from?.first_name || 'User';

        console.log(`[PID:${PID}] Received: ${text}`);

        if (text.startsWith('/')) {
            await handleCommand(text, chatId, config.botToken, username);
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

async function handleHelpCommand(chatId: number | string, token: string) {
    const keyboard = [
        [{ text: '📊 Start New Scan', callback_data: 'cmd_scan_info' }],
        [{ text: '📋 View Recent Scans', callback_data: 'cmd_list' }],
        [{ text: '❓ Command Guide', callback_data: 'cmd_help' }]
    ];

    await sendTelegramMessageWithKeyboard(chatId, token, `👋 <b>SCA Platform Bot</b>

Welcome to the Security Code Analysis assistant. Use the buttons below or type commands directly.

📊 <b>/scan</b> - Start a new analysis
📋 <b>/listscan</b> - Show latest reports
🔍 <b>/status</b> - Track progress
📋 <b>/help</b> - Show this message`, keyboard);
}

async function handleListScanCommand(chatId: number | string, token: string) {
    try {
        const { getRecentScans } = await import('./db-helpers');
        const scans = await getRecentScans(10);
        if (scans.length === 0) {
            await sendTelegramMessage(chatId, token, '📋 Chưa có lượt quét nào.');
            return;
        }
        const keyboard = scans.map((s: any) => [{
            text: `${s.status === 'completed' ? '✅' : '⏳'} ${s.sourceName}`,
            callback_data: `status_${s.id}`
        }]);
        await sendTelegramMessageWithKeyboard(chatId, token, '📋 <b>Danh sách quét gần đây:</b>', keyboard);
    } catch (e) { }
}

async function handleStatusCommand(scanId: string, chatId: number | string, token: string) {
    try {
        const scanData = await getScanById(scanId);
        if (!scanData) {
            await sendTelegramMessage(chatId, token, `❌ Scan not found: ${scanId}`);
            return;
        }

        const status = scanData.status || 'unknown';
        const projectName = scanData.source?.name || 'Unknown';
        const timestamp = new Date(scanData.timestamp).toLocaleString();

        let emoji = status === 'completed' ? '✅' : (status === 'running' ? '🔄' : '❌');

        let message = `${emoji} <b>Scan Status</b>\n\n`;
        message += `🆔 ID: <code>${scanId}</code>\n`;
        message += `📁 Project: <b>${projectName}</b>\n`;
        message += `📅 Started: ${timestamp}\n`;
        message += `📊 Status: <b>${status}</b>\n\n`;

        if (status === 'completed') {
            const findings = scanData.findings || [];
            message += `📋 <b>Results:</b> ${findings.length} findings\n`;
        } else if (status === 'running') {
            message += `⏳ Trạng thái đang được cập nhật...`;
        }

        await sendTelegramMessage(chatId, token, message);
    } catch (error) { }
}

async function handleCommand(text: string, chatId: number | string, token: string, user: string) {
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
        case '/start':
        case '/help':
            await handleHelpCommand(chatId, token);
            break;

        case '/listscan':
            await handleListScanCommand(chatId, token);
            break;

        case '/scan':
            if (args.length === 0) {
                await sendTelegramMessage(chatId, token, '❌ Thiếu URL. VD: /scan https://github.com/...');
                return;
            }
            await sendTelegramMessage(chatId, token, `🚀 Đang khởi tạo quét...`);
            const res = await triggerScan(args[0], chatId, user);
            if (res.success) {
                await sendTelegramMessage(chatId, token, `✅ Đã bắt đầu! ID: <code>${res.scanId}</code>`);
            } else {
                await sendTelegramMessage(chatId, token, `❌ Lỗi: ${res.error}`);
            }
            break;

        case '/status':
            if (args[0]) await handleStatusCommand(args[0], chatId, token);
            break;

        default:
            await sendTelegramMessage(chatId, token, `❓ Lệnh không hợp lệ.`);
    }
}

async function sendTelegramMessage(chatId: number | string, token: string, text: string) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: wrapMessage(text), parse_mode: 'HTML' }),
        });
    } catch (e) { }
}

async function sendTelegramMessageWithKeyboard(chatId: number | string, token: string, text: string, keyboard: any[]) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: wrapMessage(text),
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: keyboard }
            }),
        });
    } catch (e) { }
}

async function triggerScan(url: string, chatId: number | string, user: string) {
    try {
        const res = await fetch('http://localhost:3000/api/scan/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: 'git', url, metadata: { telegramChatId: chatId, triggeredBy: user } }),
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
