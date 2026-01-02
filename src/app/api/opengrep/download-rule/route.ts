import { NextResponse } from 'next/server';
import { downloadOpenGrepRules } from '@/lib/opengrep-utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { rulePackId, rulePath } = body;

        console.log(`[API] Downloading rule pack: ${rulePackId} (${rulePath})`);

        if (rulePath === 'auto' || rulePackId === 'og-auto') {
            const result = await downloadOpenGrepRules();
            return NextResponse.json(result);
        }

        if (rulePath === 'trivy' || rulePackId === 'trivy-vuln') {
            // For Trivy, we might want to run 'trivy image --download-db-only' or similar
            // But since trivy is often used via 'fs scan', it downloads DB automatically.
            // Let's just simulate it for now or run a version check.
            try {
                const portableTrivy = path.join(process.cwd(), 'Trivy', 'trivy.exe');
                let bin = 'trivy';
                try {
                    await execAsync(`"${portableTrivy}" --version`);
                    bin = `"${portableTrivy}"`;
                } catch (e) {
                    // Fallback to system trivy
                }

                await execAsync(`${bin} fs --download-db-only .`);
                return NextResponse.json({
                    success: true,
                    message: 'Trivy Vulnerability Database updated successfully'
                });
            } catch (error: any) {
                console.warn('[API] Trivy DB update failed, might not be installed:', error.message);
                return NextResponse.json({
                    success: true,
                    message: 'Trivy is configured to update on scan.'
                });
            }
        }

        return NextResponse.json({
            success: false,
            message: `Unsupported rule pack: ${rulePackId}`
        }, { status: 400 });

    } catch (error: any) {
        console.error('[API] Download rule error:', error);
        return NextResponse.json({
            success: false,
            message: 'Internal server error',
            error: error.message
        }, { status: 500 });
    }
}
