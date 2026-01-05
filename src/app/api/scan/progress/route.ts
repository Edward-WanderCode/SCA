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
            let current = logger.getScanProgress(scanId);

            // If not in memory, check database
            if (!current) {
                try {
                    const { prisma } = await import('@/lib/prisma');
                    const dbScan = await prisma.scan.findUnique({
                        where: { id: scanId }
                    });

                    if (dbScan) {
                        if (dbScan.status === 'completed') {
                            // Already finished, tell client to finish
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
                            // Failed scan
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                scanId,
                                progress: 0,
                                error: dbScan.lastDetails || 'Scan failed',
                            })}\n\n`));
                            clearInterval(pingInterval);
                            controller.close();
                            return;
                        } else if (dbScan.status === 'running') {
                            // Send current progress from database
                            current = {
                                scanId,
                                progress: dbScan.lastProgress,
                                stage: dbScan.lastStage,
                                details: dbScan.lastDetails,
                            };
                        }
                    } else {
                        // Scan not found
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
            }

            console.log(`[SSE] Connection for scanId: ${scanId}. Found in logger: ${!!current}`);

            if (current) {
                console.log(`[SSE] Sending initial state for ${scanId}: ${current.progress}%, Stage: ${current.stage}`);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(current)}\n\n`));
            } else {
                console.log(`[SSE] No initial state found for ${scanId} yet.`);
                // Send an initial "waiting" state
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    scanId,
                    progress: 0,
                    stage: 'Connecting...',
                    details: 'Establishing link to scan engine'
                })}\n\n`));
            }

            // Poll database for updates every 1 second
            const pollInterval = setInterval(async () => {
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
                        };

                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(update)}\n\n`));

                        if (dbScan.status === 'completed' || dbScan.status === 'failed') {
                            clearInterval(pollInterval);
                            clearInterval(pingInterval);

                            if (dbScan.status === 'completed') {
                                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                                    scanId,
                                    progress: 100,
                                    stage: 'Complete',
                                    details: 'Scan finished successfully'
                                })}\n\n`));
                            }

                            controller.close();
                        }
                    }
                } catch (err) {
                    console.error('[SSE] Polling error:', err);
                }
            }, 1000); // Poll every 1 second


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
