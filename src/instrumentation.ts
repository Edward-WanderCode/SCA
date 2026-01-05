export async function register() {
    // Only run on the server side (Node.js runtime)
    // and only in the background process, not during build
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { startTelegramPolling } = await import('./lib/telegram-polling');

        console.log('[Instrumentation] Initializing background services...');

        // Start Telegram Polling automatically
        startTelegramPolling();
    }
}
