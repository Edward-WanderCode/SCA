#!/usr/bin/env node

/**
 * Stop Telegram Polling Service
 * 
 * Usage:
 *   node scripts/stop-telegram-polling.js
 */

const http = require('http');

console.log('🛑 Stopping Telegram Polling Service\n');

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/telegram/polling',
    method: 'DELETE',
};

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
                console.log('✅ Telegram polling stopped successfully!');
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
