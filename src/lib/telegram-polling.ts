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
                await sendTelegramMessage(chatId, config.botToken, "🚀 <b>Cách quét:</b>\n\nGửi lệnh <code>/scan</code> kèm theo URL repository.\n\nVí dụ:\n<code>/scan https://github.com/user/repo.git</code>");
            }
            return;
        }

        const msg = update.message;

        // Handle document uploads (RAR/ZIP files) - Only in specific topics
        if (msg?.document) {
            const chatId = msg.chat.id;
            const username = msg.from?.username || msg.from?.first_name || 'User';
            const messageThreadId = msg.message_thread_id;
            const topicName = msg.reply_to_message?.forum_topic_created?.name || '';

            await handleDocumentUpload(msg.document, chatId, config.botToken, username, messageThreadId, topicName);
            return;
        }

        if (!msg?.text) return;

        const chatId = msg.chat.id;
        const text = msg.text.trim();
        const username = msg.from?.username || msg.from?.first_name || 'User';
        const messageThreadId = msg.message_thread_id; // Get topic ID if in a topic

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

async function handleHelpCommand(chatId: number | string, token: string) {
    const keyboard = [
        [{ text: '📊 Bắt Đầu Quét Mới', callback_data: 'cmd_scan_info' }],
        [{ text: '📋 Xem Lịch Sử Quét', callback_data: 'cmd_list' }],
        [{ text: '❓ Hướng Dẫn Lệnh', callback_data: 'cmd_help' }]
    ];

    await sendTelegramMessageWithKeyboard(chatId, token, `👋 <b>SCA Platform Bot</b>

Chào mừng bạn đến với trợ lý phân tích bảo mật mã nguồn. Sử dụng các nút bên dưới hoặc gõ lệnh trực tiếp.

📊 <b>/scan</b> - Bắt đầu quét mới
� <b>Upload File</b> - Tải lên file RAR/ZIP để quét
�📋 <b>/listscan</b> - Hiển thị danh sách quét
🔍 <b>/status</b> - Theo dõi tiến trình
🔄 <b>/rescan</b> - Quét lại và so sánh thay đổi
🗑️ <b>/delete</b> - Xóa một lần quét và topic
📋 <b>/help</b> - Hiển thị tin nhắn này

💡 <b>Mẹo:</b> Bạn có thể upload trực tiếp file RAR hoặc ZIP vào chat. Bot sẽ tự động tải về, giải nén và quét!`, keyboard);
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
            await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan: ${scanId}`);
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
            message += `⏳ Trạng thái đang được cập nhật...`;
        }

        await sendTelegramMessage(chatId, token, message);
    } catch (error) { }
}

async function handleCommand(text: string, chatId: number | string, token: string, user: string, messageThreadId?: number) {
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

        case '/delete':
            await handleDeleteCommand(text, chatId, token, messageThreadId);
            break;

        case '/rescan':
            await handleRescanCommand(text, chatId, token, user, messageThreadId);
            break;

        default:
            await sendTelegramMessage(chatId, token, `❓ Lệnh không hợp lệ.`);
    }
}

async function handleDeleteCommand(text: string, chatId: number | string, token: string, messageThreadId?: number) {
    try {
        const { prisma } = await import('./prisma');
        const { deleteForumTopic } = await import('./telegram');

        const messageText = text.trim();
        const parts = messageText.split(/\s+/);

        let scanData;

        // First, try to find scan by thread ID if we're in a topic
        if (messageThreadId) {
            scanData = await prisma.scan.findFirst({
                where: {
                    telegramChatId: chatId.toString(),
                    telegramThreadId: messageThreadId,
                },
            });

            if (!scanData) {
                await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan nào trong topic này.\n\n💡 Tip: Bạn có thể dùng /delete [scan_id] để xóa scan khác.`);
                return;
            }
        } else {
            // Not in a topic, require scan ID
            if (parts.length < 2) {
                await sendTelegramMessage(chatId, token, `❌ Vui lòng cung cấp Scan ID.\n\nVí dụ: /delete scan_abc123`);
                return;
            }

            const scanId = parts[1];
            scanData = await prisma.scan.findUnique({
                where: { id: scanId },
            });

            if (!scanData) {
                await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan: ${scanId}`);
                return;
            }
        }

        // Delete the topic if it exists
        if (scanData.telegramThreadId && scanData.telegramChatId) {
            const deleteResult = await deleteForumTopic(
                scanData.telegramChatId,
                scanData.telegramThreadId,
                scanData.sourceName
            );

            if (!deleteResult.success) {
                await sendTelegramMessage(chatId, token, `⚠️ Không thể xóa topic: ${deleteResult.error}`);
            }
        }

        // Delete scan and findings from database
        await prisma.scan.delete({
            where: { id: scanData.id },
        });

        await sendTelegramMessage(chatId, token, `✅ Đã xóa scan ${scanData.id} và topic thành công!`);
    } catch (error: any) {
        console.error('Delete command error:', error);
        await sendTelegramMessage(chatId, token, `❌ Lỗi: ${error.message}`);
    }
}

async function handleRescanCommand(text: string, chatId: number | string, token: string, user: string, messageThreadId?: number) {
    try {
        const { prisma } = await import('./prisma');
        const parts = text.trim().split(/\s+/);

        let oldScan;

        // First, try to find scan by thread ID if we're in a topic
        if (messageThreadId) {
            oldScan = await prisma.scan.findFirst({
                where: {
                    telegramChatId: chatId.toString(),
                    telegramThreadId: messageThreadId,
                },
                include: { findings: true },
            });

            if (!oldScan) {
                await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan nào trong topic này.\n\n💡 Tip: Bạn có thể dùng /rescan [scan_id] để rescan scan khác.`);
                return;
            }
        } else {
            // Not in a topic, require scan ID
            if (parts.length < 2) {
                await sendTelegramMessage(chatId, token, `❌ Vui lòng cung cấp Scan ID để rescan.\n\nVí dụ: /rescan scan_abc123`);
                return;
            }

            const oldScanId = parts[1];
            oldScan = await prisma.scan.findUnique({
                where: { id: oldScanId },
                include: { findings: true },
            });

            if (!oldScan) {
                await sendTelegramMessage(chatId, token, `❌ Không tìm thấy scan: ${oldScanId}`);
                return;
            }
        }

        // Check if we have the source URL to rescan
        if (!oldScan.sourceUrl) {
            await sendTelegramMessage(chatId, token, `❌ Scan này không có URL để rescan. Chỉ có thể rescan các scan từ Git.`);
            return;
        }

        await sendTelegramMessage(chatId, token, `🚀 Đang khởi tạo rescan cho:\n📁 ${oldScan.sourceName}\n🔗 ${oldScan.sourceUrl}`);

        // Trigger a new scan with comparison to the old scan
        // Also pass the telegramThreadId to reuse the same topic
        const res = await triggerScan(oldScan.sourceUrl, chatId, user, oldScan.id, oldScan.telegramThreadId);

        if (res.success) {
            const oldFindings = oldScan.criticalCount + oldScan.highCount + oldScan.mediumCount + oldScan.lowCount + oldScan.infoCount;
            await sendTelegramMessage(
                chatId,
                token,
                `✅ Đã bắt đầu rescan!\n\n📊 Scan cũ: ${oldFindings} lỗi\n🆔 Scan mới: <code>${res.scanId}</code>\n\n⏳ Đang so sánh...`
            );
        } else {
            await sendTelegramMessage(chatId, token, `❌ Lỗi: ${res.error}`);
        }
    } catch (error: any) {
        console.error('Rescan command error:', error);
        await sendTelegramMessage(chatId, token, `❌ Lỗi: ${error.message}`);
    }
}

async function handleDocumentUpload(
    document: any,
    chatId: number | string,
    token: string,
    username: string,
    messageThreadId?: number,
    topicName?: string
) {
    try {
        const fileName = document.file_name || 'unknown';
        const fileSize = document.file_size || 0;

        console.log(`[PID:${PID}] Received document: ${fileName} (${fileSize} bytes)`);

        // IMPORTANT: Only process files uploaded in specific topics
        const {
            getCachedTopicName,
            cacheTopicInfo,
            isUploadAllowedInTopic,
            getAllowedUploadTopics
        } = await import('./topic-manager');

        // If not in a topic, reject immediately
        if (!messageThreadId) {
            await sendTelegramMessage(
                chatId,
                token,
                `❌ <b>Upload bị từ chối</b>\n\n` +
                `💡 Vui lòng upload file vào một trong các topic sau:\n` +
                getAllowedUploadTopics().map(t => `   • <b>${t}</b>`).join('\n') +
                `\n\n⚠️ Không được upload trực tiếp vào chat chính.`
            );
            return;
        }

        // Try to get topic name from cache or parameter
        let currentTopicName = topicName;
        if (!currentTopicName) {
            currentTopicName = (await getCachedTopicName(chatId, messageThreadId)) || undefined;
        }

        // Cache the topic name if we got it from parameter
        if (topicName && messageThreadId) {
            await cacheTopicInfo(chatId, messageThreadId, topicName);
        }

        // Check if topic is allowed
        if (!isUploadAllowedInTopic(currentTopicName)) {
            await sendTelegramMessage(
                chatId,
                token,
                `❌ <b>Upload bị từ chối</b>\n\n` +
                `💡 Vui lòng upload file vào topic:\n` +
                getAllowedUploadTopics().map(t => `   • <b>${t}</b>`).join('\n') +
                `\n\n📌 Topic hiện tại: <i>${currentTopicName || 'Unknown'}</i>`
            );
            return;
        }

        console.log(`[PID:${PID}] Upload allowed in topic: ${currentTopicName}`);

        // Import file handler functions
        const {
            isSupportedArchive,
            downloadTelegramFile,
            extractArchive,
            formatFileSize
        } = await import('./file-handler');

        // Check if file is a supported archive
        if (!isSupportedArchive(fileName)) {
            await sendTelegramMessage(
                chatId,
                token,
                `❌ File không được hỗ trợ: ${fileName}\n\n💡 Chỉ hỗ trợ file RAR và ZIP.`
            );
            return;
        }

        // Send acknowledgment message
        await sendTelegramMessage(
            chatId,
            token,
            `📥 Đang tải xuống file: <b>${fileName}</b>\n📦 Kích thước: ${formatFileSize(fileSize)}\n\n⏳ Vui lòng đợi...`
        );

        // Download file
        const downloadResult = await downloadTelegramFile(document.file_id, token, fileName);

        if (!downloadResult.success || !downloadResult.filePath) {
            await sendTelegramMessage(chatId, token, `❌ Lỗi tải file: ${downloadResult.error}`);
            return;
        }

        await sendTelegramMessage(
            chatId,
            token,
            `✅ Đã tải xuống!\n📂 Đang giải nén file...`
        );

        // Extract archive
        const extractResult = await extractArchive(downloadResult.filePath);

        if (!extractResult.success || !extractResult.extractPath) {
            await sendTelegramMessage(chatId, token, `❌ Lỗi giải nén: ${extractResult.error}`);
            return;
        }

        await sendTelegramMessage(
            chatId,
            token,
            `✅ Đã giải nén thành công!\n📁 Thư mục: <code>${extractResult.extractPath}</code>\n\n🚀 Đang bắt đầu quét bảo mật...`
        );

        // Trigger scan on extracted folder
        const scanResult = await triggerFolderScan(extractResult.extractPath, chatId, username, messageThreadId);

        if (scanResult.success) {
            await sendTelegramMessage(
                chatId,
                token,
                `✅ Đã bắt đầu quét!\n📁 Dự án: <b>${fileName}</b>\n🆔 Scan ID: <code>${scanResult.scanId}</code>\n\n⏳ Quá trình quét sẽ được thông báo khi hoàn thành.`
            );
        } else {
            await sendTelegramMessage(chatId, token, `❌ Lỗi khởi tạo quét: ${scanResult.error}`);
        }
    } catch (error: any) {
        console.error('[PID:${PID}] Document upload error:', error);
        await sendTelegramMessage(chatId, token, `❌ Lỗi xử lý file: ${error.message}`);
    }
}

async function triggerFolderScan(
    folderPath: string,
    chatId: number | string,
    user: string,
    messageThreadId?: number
) {
    try {
        const path = await import('path');
        const projectName = path.basename(folderPath);

        const body: any = {
            method: 'folder',
            folderPath: folderPath,
            metadata: {
                telegramChatId: chatId,
                triggeredBy: user,
                source: 'telegram_upload'
            }
        };

        if (messageThreadId) {
            body.metadata.telegramThreadId = messageThreadId;
        }

        const res = await fetch('http://localhost:3000/api/scan/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        return await res.json();
    } catch (e: any) {
        return { success: false, error: e.message };
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
