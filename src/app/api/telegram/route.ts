import { NextRequest, NextResponse } from 'next/server';
import { loadTelegramConfig, saveTelegramConfig, testTelegramConnection } from '@/lib/telegram';

export async function GET() {
    try {
        const config = await loadTelegramConfig();

        if (!config) {
            return NextResponse.json({
                botToken: '',
                chatId: '',
                enabled: false,
            });
        }

        // Don't expose the full bot token for security
        return NextResponse.json({
            botToken: config.botToken ? '***' + config.botToken.slice(-8) : '',
            chatId: config.chatId,
            enabled: config.enabled,
            hasToken: !!config.botToken,
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to load configuration' },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { botToken, chatId, enabled } = body;

        if (!botToken || !chatId) {
            return NextResponse.json(
                { error: 'Bot token and chat ID are required' },
                { status: 400 }
            );
        }

        await saveTelegramConfig({
            botToken,
            chatId,
            enabled: enabled ?? true,
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to save configuration' },
            { status: 500 }
        );
    }
}

export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { botToken, chatId } = body;

        if (!botToken || !chatId) {
            return NextResponse.json(
                { error: 'Bot token and chat ID are required' },
                { status: 400 }
            );
        }

        const result = await testTelegramConnection(botToken, chatId);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || 'Connection test failed' },
                { status: 400 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to test connection' },
            { status: 500 }
        );
    }
}
