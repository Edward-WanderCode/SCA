#!/usr/bin/env node

/**
 * Telegram Webhook Setup Script
 * 
 * This script helps you set up a webhook for your Telegram bot
 * so it can receive commands from users.
 * 
 * Usage:
 *   node scripts/setup-telegram-webhook.js <bot-token> <webhook-url>
 * 
 * Example:
 *   node scripts/setup-telegram-webhook.js 123456:ABC-DEF https://your-domain.com/api/telegram/webhook
 */

const https = require('https');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.error('❌ Error: Missing required arguments\n');
    console.log('Usage:');
    console.log('  node scripts/setup-telegram-webhook.js <bot-token> <webhook-url>\n');
    console.log('Example:');
    console.log('  node scripts/setup-telegram-webhook.js 123456:ABC-DEF https://your-domain.com/api/telegram/webhook\n');
    process.exit(1);
}

const [botToken, webhookUrl] = args;

// Validate webhook URL
try {
    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:') {
        console.error('❌ Error: Webhook URL must use HTTPS protocol');
        process.exit(1);
    }
} catch (error) {
    console.error('❌ Error: Invalid webhook URL');
    process.exit(1);
}

console.log('🤖 Telegram Webhook Setup\n');
console.log('Bot Token:', botToken.substring(0, 10) + '...');
console.log('Webhook URL:', webhookUrl);
console.log('');

// Set webhook
console.log('⏳ Setting webhook...');

const setWebhookUrl = `https://api.telegram.org/bot${botToken}/setWebhook`;
const setWebhookData = JSON.stringify({
    url: webhookUrl
});

const setWebhookOptions = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': setWebhookData.length
    }
};

const req = https.request(setWebhookUrl, setWebhookOptions, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const result = JSON.parse(data);

            if (result.ok) {
                console.log('✅ Webhook set successfully!\n');
                console.log('Description:', result.description);
                console.log('');

                // Now get webhook info to verify
                console.log('⏳ Verifying webhook...');
                verifyWebhook(botToken);
            } else {
                console.error('❌ Failed to set webhook');
                console.error('Error:', result.description);
                process.exit(1);
            }
        } catch (error) {
            console.error('❌ Failed to parse response:', error.message);
            process.exit(1);
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Error setting webhook:', error.message);
    process.exit(1);
});

req.write(setWebhookData);
req.end();

// Verify webhook function
function verifyWebhook(botToken) {
    const webhookInfoUrl = `https://api.telegram.org/bot${botToken}/getWebhookInfo`;

    https.get(webhookInfoUrl, (res) => {
        let data = '';

        res.on('data', (chunk) => {
            data += chunk;
        });

        res.on('end', () => {
            try {
                const result = JSON.parse(data);

                if (result.ok) {
                    const info = result.result;

                    console.log('✅ Webhook verified!\n');
                    console.log('📋 Webhook Information:');
                    console.log('   URL:', info.url || 'Not set');
                    console.log('   Has Custom Certificate:', info.has_custom_certificate || false);
                    console.log('   Pending Update Count:', info.pending_update_count || 0);
                    console.log('   Max Connections:', info.max_connections || 'Default (40)');

                    if (info.last_error_date) {
                        const errorDate = new Date(info.last_error_date * 1000);
                        console.log('   ⚠️ Last Error:', info.last_error_message);
                        console.log('   ⚠️ Last Error Date:', errorDate.toLocaleString());
                    }

                    console.log('\n✨ Setup complete! Your bot is now ready to receive commands.\n');
                    console.log('Try these commands in Telegram:');
                    console.log('   /help - Show available commands');
                    console.log('   /scan <repo-url> - Start a security scan');
                    console.log('   /status <scan-id> - Check scan status');
                } else {
                    console.error('❌ Failed to get webhook info');
                    console.error('Error:', result.description);
                }
            } catch (error) {
                console.error('❌ Failed to parse response:', error.message);
            }
        });
    }).on('error', (error) => {
        console.error('❌ Error getting webhook info:', error.message);
    });
}
