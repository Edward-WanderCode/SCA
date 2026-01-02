// src/app/api/terminal/stream/route.ts
import { logger } from '@/lib/logger';
import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            // Send existing logs first
            const existingLogs = logger.getLogs();
            existingLogs.forEach(log => {
                const data = JSON.stringify(log);
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            });

            // Subscribe to new logs
            const unsubscribe = logger.subscribe((log) => {
                const data = JSON.stringify(log);
                try {
                    controller.enqueue(encoder.encode(`data: ${data}\n\n`));
                } catch (e) {
                    // Controller might be closed
                    unsubscribe();
                }
            });

            // Keep connection alive
            const heartbeat = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': heartbeat\n\n'));
                } catch (e) {
                    clearInterval(heartbeat);
                    unsubscribe();
                }
            }, 30000);

            // Handle client disconnect
            req.signal.addEventListener('abort', () => {
                clearInterval(heartbeat);
                unsubscribe();
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
