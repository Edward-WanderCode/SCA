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
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            message: 'Internal server error',
            error: error.message
        }, { status: 500 });
    }
}
