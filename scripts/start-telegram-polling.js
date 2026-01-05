#!/usr/bin/env node

/**
 * Start Telegram Polling Service
 * 
 * This script starts the Telegram bot in polling mode.
 * Perfect for private networks where you can't expose webhooks to internet.
 * 
 * Usage:
 *   node scripts/start-telegram-polling.js
 */

const http = require('http');

console.log('🤖 Starting Telegram Polling Service\n');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/telegram/polling',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    }
};

console.log('⏳ Sending request to http://localhost:3000/api/telegram/polling...\n');

const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const result = JSON.parse(data);

            console.log('📡 Response Status:', res.statusCode);
            console.log('📄 Response:', JSON.stringify(result, null, 2));
            console.log('');

            if (result.success) {
                console.log('✅ Telegram polling started successfully!');
                console.log('');
                console.log('🎉 Your bot is now listening for commands!');
                console.log('');
                console.log('💡 What to do next:');
                console.log('   1. Open Telegram and start a chat with your bot');
                console.log('   2. Send: /help');
                console.log('   3. Try: /scan https://github.com/user/repo.git');
                console.log('');
                console.log('📊 The polling service will continue running in the background');
                console.log('   It will automatically check for new messages every 2 seconds');
                console.log('');
                console.log('⚠️  Keep your dev server running (npm run dev)');
            } else {
                console.log('⚠️  Warning:', result.message);
            }
        } catch (error) {
            console.error('❌ Failed to parse response');
        }
    });
});

req.on('error', (error) => {
    console.error('❌ Error:', error.message);
    console.error('');
    console.error('Make sure your development server is running:');
    console.error('   npm run dev');
});

req.end();
