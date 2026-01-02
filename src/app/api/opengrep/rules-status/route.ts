// src/app/api/opengrep/rules-status/route.ts
import { NextResponse } from 'next/server';
import { checkRulesStatus } from '@/lib/opengrep-utils';

export async function GET() {
    try {
        const status = await checkRulesStatus();
        return NextResponse.json({
            success: true,
            ...status
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
    }
}
