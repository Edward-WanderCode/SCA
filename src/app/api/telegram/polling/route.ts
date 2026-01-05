import { NextResponse } from 'next/server';
import { startTelegramPolling, stopTelegramPolling, isPollingActive } from '@/lib/telegram-polling';

/**
 * GET: Check polling status
 */
export async function GET() {
    return NextResponse.json({
        active: isPollingActive(),
        mode: 'polling'
    });
}

/**
 * POST: Start polling
 */
export async function POST() {
    try {
        if (isPollingActive()) {
            return NextResponse.json({
                success: false,
                message: 'Polling is already running'
            });
        }

        startTelegramPolling();

        return NextResponse.json({
            success: true,
            message: 'Telegram polling started'
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}

/**
 * DELETE: Stop polling
 */
export async function DELETE() {
    try {
        stopTelegramPolling();

        return NextResponse.json({
            success: true,
            message: 'Telegram polling stopped'
        });
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 });
    }
}
