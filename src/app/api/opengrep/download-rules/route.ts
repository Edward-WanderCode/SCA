// src/app/api/opengrep/download-rules/route.ts
import { NextResponse } from 'next/server';
import { downloadOpenGrepRules } from '@/lib/opengrep-utils';

export async function POST() {
    try {
        const result = await downloadOpenGrepRules();
        return NextResponse.json(result);
    } catch (error: any) {
        return NextResponse.json({
            success: false,
            message: 'Internal server error',
            error: error.message
        }, { status: 500 });
    }
}
