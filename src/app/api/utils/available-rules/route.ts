import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        success: true,
        totalPacks: 2,
        downloadedCount: 2,
        rules: [
            {
                id: 'og-auto',
                name: 'Opengrep Auto',
                category: 'All Rules',
                description: 'Automatically select best rules for your project language and framework.',
                language: 'Multi-language',
                icon: '🚀',
                path: 'auto',
                popularity: 99,
                ruleCount: 2450,
                isDownloaded: true,
                downloadedAt: new Date().toISOString(),
                localSize: 120,
                localRuleCount: 2450
            },
            {
                id: 'trivy-vuln',
                name: 'Trivy Vulnerability DB',
                category: 'Infrastructure',
                description: 'Scan for known vulnerabilities in your project dependencies (SCA).',
                language: 'Project-wide',
                icon: '🛡️',
                path: 'trivy',
                popularity: 95,
                ruleCount: 50000,
                isDownloaded: true,
                downloadedAt: new Date().toISOString(),
                localSize: 1500,
                localRuleCount: 50000
            }
        ]
    });
}
