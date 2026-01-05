import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const scanId = searchParams.get('id');

    if (!scanId) {
        return NextResponse.json({ error: 'Missing scan ID' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            // Heartbeat to keep connection alive
            const pingInterval = setInterval(() => {
                try {
                    controller.enqueue(encoder.encode(': ping\n\n'));
                } catch (e) {
                    clearInterval(pingInterval);
                }
            }, 15000);

            // Send current status immediately
            const current = logger.getScanProgress(scanId);
            console.log(`[SSE] Connection for scanId: ${scanId}. Found in logger: ${!!current}`);

            if (current) {
                console.log(`[SSE] Sending initial state for ${scanId}: ${current.progress}%, Stage: ${current.stage}`);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(current)}\n\n`));
            } else {
                console.log(`[SSE] No initial state found for ${scanId} yet. Logger active scans: ${Array.from((logger as any).activeScans?.keys() || []).join(', ')}`);
                // Send an initial "waiting" state
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    scanId,
                    progress: 0,
                    stage: 'Connecting...',
                    details: 'Establishing link to scan engine'
                })}\n\n`));
            }

            // Subscribe to updates
            const unsubscribe = logger.subscribeProgress((update) => {
                if (update.scanId === scanId) {
                    try {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
                        if (update.progress >= 100) {
                            clearInterval(pingInterval);
                            controller.close();
                        }
                    } catch (e) {
                        unsubscribe();
                        clearInterval(pingInterval);
                    }
                }
            });

            // Clean up on close - listener for request.signal
            request.signal.addEventListener('abort', () => {
                console.log(`[SSE] Client disconnected from progress stream for ${scanId}`);
                unsubscribe();
                clearInterval(pingInterval);
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
