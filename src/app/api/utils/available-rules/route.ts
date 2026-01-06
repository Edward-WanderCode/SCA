import { NextResponse } from 'next/server';

export async function GET() {
    return NextResponse.json({
        success: true,
        totalPacks: 4,
        rules: [
            {
                id: 'og-auto',
                name: 'Semgrep Registry (Auto)',
                category: 'General',
                description: 'Automatically selects best rules for your project stack from Semgrep Registry.',
                scope: 'Single File Analysis',
                type: 'Online Registry',
                language: 'Multi-language',
                icon: '🚀',
                path: 'auto',
                popularity: 100,
                ruleCount: 2500,
                isAvailable: true
            },
            {
                id: 'og-security',
                name: 'Security Audit',
                category: 'Security',
                description: 'Focus on high-confidence security issues and vulnerabilities (p/security-audit).',
                scope: 'Single File Analysis',
                type: 'Online Registry',
                language: 'Multi-language',
                icon: '🔒',
                path: 'p/security-audit',
                popularity: 90,
                ruleCount: 800,
                isAvailable: true
            },
            {
                id: 'og-owasp',
                name: 'OWASP Top 10',
                category: 'Compliance',
                description: 'Rules mapping to OWASP Top 10 security risks (p/owasp-top-ten).',
                scope: 'Single File Analysis',
                type: 'Online Registry',
                language: 'Multi-language',
                icon: '📜',
                path: 'p/owasp-top-ten',
                popularity: 85,
                ruleCount: 300,
                isAvailable: true
            },
            {
                id: 'trivy-vuln',
                name: 'Trivy Vulnerability DB',
                category: 'Dependencies',
                description: 'Scan for known vulnerabilities in your OS packages and dependencies.',
                scope: 'Project Dependencies (SCA)',
                type: 'Local Binary + Online DB',
                language: 'Project-wide',
                icon: '🛡️',
                path: 'trivy',
                popularity: 95,
                ruleCount: 50000,
                isAvailable: true
            }
        ]
    });
}
