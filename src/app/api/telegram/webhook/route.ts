import { NextRequest, NextResponse } from 'next/server';
import { loadTelegramConfig } from '@/lib/telegram';
import { getScanById } from '@/lib/db-helpers';

/**
 * Telegram Webhook Handler
 * Receives commands from Telegram bot and triggers scans
 */
export async function POST(request: NextRequest) {
    try {
        const update = await request.json();
        console.log('[Telegram Webhook] Received update:', JSON.stringify(update, null, 2));

        // Extract message from update
        const message = update.message || update.edited_message;
        if (!message || !message.text) {
            return NextResponse.json({ ok: true });
        }

        const chatId = message.chat.id;
        const text = message.text.trim();
        const userId = message.from?.id;
        const username = message.from?.username || message.from?.first_name || 'User';

        console.log(`[Telegram] Message from ${username} (${userId}): ${text}`);

        // Load config to get bot token
        const config = await loadTelegramConfig();
        if (!config || !config.botToken) {
            console.error('[Telegram] No bot token configured');
            return NextResponse.json({ ok: true });
        }

        // Parse command
        if (text.startsWith('/')) {
            await handleCommand(text, chatId, config.botToken, username);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[Telegram Webhook] Error:', error);
        return NextResponse.json({ ok: true }); // Always return ok to Telegram
    }
}

/**
 * Handle Telegram commands
 */
async function handleCommand(
    text: string,
    chatId: number | string,
    botToken: string,
    username: string
) {
    const parts = text.split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    console.log(`[Telegram] Command: ${command}, Args:`, args);

    switch (command) {
        case '/start':
        case '/help':
            await sendTelegramMessage(
                chatId,
                botToken,
                `👋 Welcome to SCA Platform Bot!

Available commands:

📊 <b>/scan &lt;repo-url&gt;</b>
   Start a security scan on a Git repository
   Example: /scan https://github.com/user/repo.git

🔍 <b>/status &lt;scan-id&gt;</b>
   Check the status of a scan
   Example: /status scan-abc123

📋 <b>/help</b>
   Show this help message

💡 Tips:
• Scans run in the background
• You'll receive a PDF report when complete
• Use /status to check progress`,
                'HTML'
            );
            break;

        case '/scan':
            if (args.length === 0) {
                await sendTelegramMessage(
                    chatId,
                    botToken,
                    '❌ Please provide a Git repository URL\n\nExample:\n<code>/scan https://github.com/user/repo.git</code>',
                    'HTML'
                );
                return;
            }

            const repoUrl = args[0];

            // Validate URL
            if (!isValidGitUrl(repoUrl)) {
                await sendTelegramMessage(
                    chatId,
                    botToken,
                    `❌ Invalid Git repository URL: ${repoUrl}\n\nPlease provide a valid Git URL (http/https/git protocol)`,
                    'HTML'
                );
                return;
            }

            // Extract repo name for display
            const repoName = extractRepoName(repoUrl);

            // Send "starting" message
            await sendTelegramMessage(
                chatId,
                botToken,
                `🚀 Starting security scan...\n\n📁 Repository: <b>${repoName}</b>\n🔗 URL: <code>${repoUrl}</code>\n\n⏳ This may take a few minutes. I'll send you the report when it's ready!`,
                'HTML'
            );

            // Trigger scan via API
            try {
                const scanResult = await triggerScan(repoUrl, chatId, username);

                if (scanResult.success) {
                    await sendTelegramMessage(
                        chatId,
                        botToken,
                        `✅ Scan started successfully!\n\n🆔 Scan ID: <code>${scanResult.scanId}</code>\n\nUse /status ${scanResult.scanId} to check progress`,
                        'HTML'
                    );
                } else {
                    await sendTelegramMessage(
                        chatId,
                        botToken,
                        `❌ Failed to start scan: ${scanResult.error}`,
                        'HTML'
                    );
                }
            } catch (error: any) {
                console.error('[Telegram] Scan trigger error:', error);
                await sendTelegramMessage(
                    chatId,
                    botToken,
                    `❌ Error starting scan: ${error.message}`,
                    'HTML'
                );
            }
            break;

        case '/status':
            if (args.length === 0) {
                await sendTelegramMessage(
                    chatId,
                    botToken,
                    '❌ Please provide a scan ID\n\nExample:\n<code>/status scan-abc123</code>',
                    'HTML'
                );
                return;
            }

            const scanId = args[0];

            try {
                const scanData = await getScanById(scanId);

                if (!scanData) {
                    await sendTelegramMessage(
                        chatId,
                        botToken,
                        `❌ Scan not found: ${scanId}`,
                        'HTML'
                    );
                    return;
                }

                const status = scanData.status || 'unknown';
                const projectName = scanData.source?.name || 'Unknown';
                const timestamp = new Date(scanData.timestamp).toLocaleString();

                let statusEmoji = '⏳';
                let statusText = status;

                if (status === 'completed') {
                    statusEmoji = '✅';
                    statusText = 'Completed';
                } else if (status === 'failed' || status === 'error') {
                    statusEmoji = '❌';
                    statusText = 'Failed';
                } else if (status === 'running') {
                    statusEmoji = '🔄';
                    statusText = 'Running';
                }

                let message = `${statusEmoji} <b>Scan Status</b>\n\n`;
                message += `🆔 ID: <code>${scanId}</code>\n`;
                message += `📁 Project: <b>${projectName}</b>\n`;
                message += `📅 Started: ${timestamp}\n`;
                message += `📊 Status: <b>${statusText}</b>\n\n`;

                if (status === 'completed' && scanData.stats) {
                    const findings = scanData.stats.findings || {};
                    const total = (findings.critical || 0) + (findings.high || 0) +
                        (findings.medium || 0) + (findings.low || 0) + (findings.info || 0);

                    message += `📋 <b>Results:</b>\n`;
                    message += `   Total Findings: ${total}\n`;
                    message += `   ⚠️ Critical: ${findings.critical || 0}\n`;
                    message += `   🔴 High: ${findings.high || 0}\n`;
                    message += `   🟡 Medium: ${findings.medium || 0}\n`;
                    message += `   🔵 Low: ${findings.low || 0}\n`;
                    message += `   ℹ️ Info: ${findings.info || 0}\n`;
                } else if (status === 'running') {
                    message += `⏳ Scan is still in progress...\n`;
                    message += `Please check again in a few minutes.`;
                }

                await sendTelegramMessage(chatId, botToken, message, 'HTML');
            } catch (error: any) {
                console.error('[Telegram] Status check error:', error);
                await sendTelegramMessage(
                    chatId,
                    botToken,
                    `❌ Error checking status: ${error.message}`,
                    'HTML'
                );
            }
            break;

        default:
            await sendTelegramMessage(
                chatId,
                botToken,
                `❓ Unknown command: ${command}\n\nUse /help to see available commands`,
                'HTML'
            );
    }
}

/**
 * Send a message to Telegram
 */
async function sendTelegramMessage(
    chatId: number | string,
    botToken: string,
    text: string,
    parseMode: string = 'HTML'
): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: parseMode,
            }),
        });

        const result = await response.json();

        if (!result.ok) {
            console.error('[Telegram] Send message failed:', result);
        }
    } catch (error) {
        console.error('[Telegram] Send message error:', error);
    }
}

/**
 * Trigger a scan via the internal API
 */
async function triggerScan(
    repoUrl: string,
    chatId: number | string,
    username: string
): Promise<{ success: boolean; scanId?: string; error?: string }> {
    try {
        // Get the base URL (use localhost in development, actual domain in production)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

        const response = await fetch(`${baseUrl}/api/scan/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                method: 'git',
                url: repoUrl,
                ruleSet: 'Community (Standard)',
                // Store telegram chat ID in metadata for notification later
                metadata: {
                    telegramChatId: chatId,
                    triggeredBy: username,
                    source: 'telegram'
                }
            }),
        });

        const result = await response.json();

        if (result.success) {
            return {
                success: true,
                scanId: result.scanId,
            };
        } else {
            return {
                success: false,
                error: result.error || 'Unknown error',
            };
        }
    } catch (error: any) {
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Validate Git URL
 */
function isValidGitUrl(url: string): boolean {
    try {
        const urlObj = new URL(url);
        const validProtocols = ['http:', 'https:', 'git:', 'ssh:'];

        if (!validProtocols.includes(urlObj.protocol)) {
            return false;
        }

        // Check if it looks like a git repository
        return url.includes('git') || url.endsWith('.git') ||
            url.includes('github') || url.includes('gitlab') ||
            url.includes('bitbucket');
    } catch {
        return false;
    }
}

/**
 * Extract repository name from URL
 */
function extractRepoName(url: string): string {
    try {
        const parts = url.split('/');
        let name = parts[parts.length - 1];

        // Remove .git extension if present
        if (name.endsWith('.git')) {
            name = name.slice(0, -4);
        }

        return name || 'Unknown Repository';
    } catch {
        return 'Unknown Repository';
    }
}
