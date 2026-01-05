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

            // Always check database for current progress
            try {
                const { prisma } = await import('@/lib/prisma');
                const dbScan = await prisma.scan.findUnique({
                    where: { id: scanId }
                });

                if (dbScan) {
                    if (dbScan.status === 'completed') {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            scanId,
                            progress: 100,
                            stage: 'Complete',
                            details: 'Scan finished successfully',
                        })}\n\n`));
                        clearInterval(pingInterval);
                        controller.close();
                        return;
                    } else if (dbScan.status === 'failed') {
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                            scanId,
                            progress: 0,
                            error: dbScan.lastDetails || 'Scan failed',
                        })}\n\n`));
                        clearInterval(pingInterval);
                        controller.close();
                        return;
                    } else {
                        // Send current progress from database
                        const current = {
                            scanId,
                            progress: dbScan.lastProgress,
                            stage: dbScan.lastStage,
                            details: dbScan.lastDetails,
                        };
                        console.log(`[SSE] Sending initial state for ${scanId}: ${current.progress}%, Stage: ${current.stage}`);
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(current)}\n\n`));
                    }
                } else {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                        scanId,
                        progress: 0,
                        error: 'Scan not found',
                    })}\n\n`));
                    clearInterval(pingInterval);
                    controller.close();
                    return;
                }
            } catch (dbError) {
                console.error('[SSE] DB check failed:', dbError);
            }

            // Poll database for updates every 1 second
            let pollInterval: NodeJS.Timeout | null = null;
            pollInterval = setInterval(async () => {
                try {
                    const { prisma } = await import('@/lib/prisma');
                    const dbScan = await prisma.scan.findUnique({
                        where: { id: scanId }
                    });

                    if (dbScan) {
                        const update = {
                            scanId,
                            progress: dbScan.lastProgress,
                            stage: dbScan.lastStage,
                            details: dbScan.lastDetails,
                            scannedFiles: dbScan.filesScanned,
                            totalFiles: dbScan.filesScanned,
                        };

                        try {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));
                        } catch (enqueueError) {
                            // Controller closed, stop polling
                            if (pollInterval) clearInterval(pollInterval);
                            return;
                        }

                        if (dbScan.status === 'completed' || dbScan.status === 'failed') {
                            if (pollInterval) clearInterval(pollInterval);
                            clearInterval(pingInterval);

                            if (dbScan.status === 'completed') {
                                try {
                                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                        scanId,
                                        progress: 100,
                                        stage: 'Complete',
                                        details: 'Scan finished successfully'
                                    })}\n\n`));
                                } catch (e) {
                                    // Controller already closed
                                }
                            }

                            try {
                                controller.close();
                            } catch (e) {
                                // Already closed
                            }
                        }
                    }
                } catch (err) {
                    console.error('[SSE] Polling error:', err);
                    if (pollInterval) clearInterval(pollInterval);
                }
            }, 1000); // Poll every 1 second

            // Clean up on close
            request.signal.addEventListener('abort', () => {
                console.log(`[SSE] Client disconnected from progress stream for ${scanId}`);
                clearInterval(pingInterval);
                if (pollInterval) clearInterval(pollInterval);
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
