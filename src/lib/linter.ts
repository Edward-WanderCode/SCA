/**
 * Linter Integration Module
 * 
 * Runs lightweight, language-specific linters for code quality analysis.
 * Supports: ESLint (JS/TS), Ruff (Python), GolangCI-Lint (Go)
 * 
 * Each linter output is normalized into the same OpenGrepFinding format
 * used by the rest of the scanner pipeline.
 * 
 * SECURITY: All external commands use spawn/execFile with argument arrays
 * to prevent shell injection attacks.
 */

import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execFileAsync = promisify(execFile);

/**
 * Safe command executor using execFile (no shell interpolation).
 * Tries multiple binaries in order and returns the first successful stdout.
 */
async function safeExec(
    candidates: { bin: string; args: string[] }[],
    options: { cwd?: string; timeout?: number; maxBuffer?: number } = {}
): Promise<{ stdout: string; success: boolean }> {
    const { cwd, timeout = 120000, maxBuffer = 50 * 1024 * 1024 } = options;

    for (const { bin, args } of candidates) {
        try {
            const result = await execFileAsync(bin, args, {
                maxBuffer,
                cwd,
                timeout,
                // No shell: true — arguments are passed as an array, safe from injection
            });
            return { stdout: result.stdout, success: true };
        } catch (err: any) {
            // Many linters exit with code 1 when they find issues — this is normal
            if (err.stdout && err.stdout.trim().length > 0) {
                const trimmed = err.stdout.trim();
                if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                    return { stdout: err.stdout, success: true };
                }
            }
            // Command not found, try next candidate
            if (
                err.code === 'ENOENT' ||
                err.message?.includes('not recognized') ||
                err.message?.includes('command not found') ||
                err.message?.includes('ENOENT')
            ) {
                continue;
            }
            // Other error with stdout available
            if (err.stdout) {
                return { stdout: err.stdout, success: true };
            }
        }
    }

    return { stdout: '', success: false };
}

export interface LinterFinding {
    check_id: string;
    path: string;
    start: { line: number; col: number };
    end: { line: number; col: number };
    extra: {
        message: string;
        severity: string;
        lines: string;
        remediation?: string;
        metadata?: {
            category?: string;
            cwe?: string[];
            owasp?: string[];
        };
    };
}

// ─── ESLint (JavaScript / TypeScript) ────────────────────────────────

async function runESLint(targetPath: string): Promise<LinterFinding[]> {
    try {
        console.log(`[Linter] Running ESLint on: ${targetPath}`);

        const eslintArgs = [
            '--no-eslintrc', '--env', 'es2021,node,browser',
            '--format', 'json', '--no-error-on-unmatched-pattern',
            targetPath,
            '--ext', '.js,.jsx,.ts,.tsx',
        ];

        const { stdout, success } = await safeExec(
            [
                { bin: 'npx', args: ['eslint', ...eslintArgs] },
                { bin: 'eslint', args: eslintArgs },
            ],
            { cwd: targetPath }
        );

        if (!success || !stdout.trim()) {
            console.warn('[Linter] ESLint not available or no output.');
            return [];
        }

        const results = JSON.parse(stdout);
        const findings: LinterFinding[] = [];

        for (const file of results) {
            if (!file.messages || file.messages.length === 0) continue;

            const relativePath = path.isAbsolute(file.filePath)
                ? path.relative(targetPath, file.filePath).replace(/\\/g, '/')
                : file.filePath.replace(/\\/g, '/');

            for (const msg of file.messages) {
                // Map ESLint severity: 2=error→medium, 1=warning→low
                let severity = 'LOW';
                if (msg.severity === 2) severity = 'WARNING';

                findings.push({
                    check_id: `eslint.${msg.ruleId || 'unknown'}`,
                    path: relativePath,
                    start: { line: msg.line || 0, col: msg.column || 0 },
                    end: { line: msg.endLine || msg.line || 0, col: msg.endColumn || msg.column || 0 },
                    extra: {
                        message: msg.message || 'ESLint issue',
                        severity,
                        lines: msg.source || '',
                        remediation: msg.fix ? `Auto-fix available: replace with suggested code` : undefined,
                        metadata: {
                            category: 'Code Quality',
                        },
                    },
                });
            }
        }

        console.log(`[Linter] ESLint found ${findings.length} issues.`);
        return findings;
    } catch (error) {
        console.warn('[Linter] ESLint failed:', error instanceof Error ? error.message : String(error));
        return [];
    }
}

// ─── Ruff (Python) ───────────────────────────────────────────────────

async function runRuff(targetPath: string): Promise<LinterFinding[]> {
    try {
        console.log(`[Linter] Running Ruff on: ${targetPath}`);

        const ruffArgs = ['check', '--output-format', 'json', '--no-fix', targetPath];

        const { stdout, success } = await safeExec(
            [
                { bin: 'ruff', args: ruffArgs },
                { bin: 'python', args: ['-m', 'ruff', ...ruffArgs] },
            ]
        );

        if (!success || !stdout.trim()) {
            console.warn('[Linter] Ruff not available or no output.');
            return [];
        }

        const results = JSON.parse(stdout);
        const findings: LinterFinding[] = [];

        for (const issue of results) {
            // Map Ruff code prefix to severity
            // F = pyflakes (fatal-like) → high
            // E = error → medium
            // W = warning → low
            // C = convention → info
            // I = isort → info
            // N = naming → low
            // D = docstring → info
            // UP, B, S, etc. = various → medium
            const code = issue.code || '';
            let severity = 'LOW';
            if (code.startsWith('F')) severity = 'WARNING'; // Pyflakes errors can mask bugs
            else if (code.startsWith('E')) severity = 'WARNING';
            else if (code.startsWith('W')) severity = 'LOW';
            else if (code.startsWith('C') || code.startsWith('I') || code.startsWith('D')) severity = 'INFO';
            else if (code.startsWith('S')) severity = 'WARNING'; // Security-related (bandit)
            else severity = 'LOW';

            const relativePath = path.isAbsolute(issue.filename)
                ? path.relative(targetPath, issue.filename).replace(/\\/g, '/')
                : (issue.filename || 'unknown').replace(/\\/g, '/');

            findings.push({
                check_id: `ruff.${code}`,
                path: relativePath,
                start: {
                    line: issue.location?.row || 0,
                    col: issue.location?.column || 0,
                },
                end: {
                    line: issue.end_location?.row || issue.location?.row || 0,
                    col: issue.end_location?.column || issue.location?.column || 0,
                },
                extra: {
                    message: issue.message || 'Ruff issue',
                    severity,
                    lines: '',
                    remediation: issue.fix?.message || undefined,
                    metadata: {
                        category: 'Code Quality',
                    },
                },
            });
        }

        console.log(`[Linter] Ruff found ${findings.length} issues.`);
        return findings;
    } catch (error) {
        console.warn('[Linter] Ruff failed:', error instanceof Error ? error.message : String(error));
        return [];
    }
}

// ─── GolangCI-Lint (Go) ─────────────────────────────────────────────

async function runGolangCILint(targetPath: string): Promise<LinterFinding[]> {
    try {
        console.log(`[Linter] Running GolangCI-Lint on: ${targetPath}`);

        // Check if it's actually a Go project (has go.mod or .go files)
        try {
            await fs.access(path.join(targetPath, 'go.mod'));
        } catch {
            // No go.mod, check for .go files
            const entries = await fs.readdir(targetPath);
            const hasGoFiles = entries.some(e => e.endsWith('.go'));
            if (!hasGoFiles) {
                console.log('[Linter] No go.mod or .go files found at root. Skipping GolangCI-Lint.');
                return [];
            }
        }

        const golintArgs = ['run', '--out-format', 'json', '--timeout', '2m', './...'];

        const { stdout, success } = await safeExec(
            [
                { bin: 'golangci-lint', args: golintArgs },
                { bin: 'golangci-lint.exe', args: golintArgs },
            ],
            { cwd: targetPath, timeout: 180000 }
        );

        if (!success || !stdout.trim()) {
            console.warn('[Linter] GolangCI-Lint not available or no output.');
            return [];
        }

        const result = JSON.parse(stdout);
        const findings: LinterFinding[] = [];

        if (result.Issues) {
            for (const issue of result.Issues) {
                let severity = 'LOW';
                if (issue.Severity === 'error') severity = 'WARNING';
                else if (issue.Severity === 'warning') severity = 'LOW';

                const relativePath = (issue.Pos?.Filename || 'unknown').replace(/\\/g, '/');

                findings.push({
                    check_id: `golangci.${issue.FromLinter || 'unknown'}.${issue.Replacement ? 'fixable' : 'manual'}`,
                    path: relativePath,
                    start: {
                        line: issue.Pos?.Line || 0,
                        col: issue.Pos?.Column || 0,
                    },
                    end: {
                        line: issue.Pos?.Line || 0,
                        col: issue.Pos?.Column || 0,
                    },
                    extra: {
                        message: issue.Text || 'Go lint issue',
                        severity,
                        lines: issue.SourceLines?.join('\n') || '',
                        remediation: issue.Replacement?.NewLines?.join('\n') || undefined,
                        metadata: {
                            category: 'Code Quality',
                        },
                    },
                });
            }
        }

        console.log(`[Linter] GolangCI-Lint found ${findings.length} issues.`);
        return findings;
    } catch (error) {
        console.warn('[Linter] GolangCI-Lint failed:', error instanceof Error ? error.message : String(error));
        return [];
    }
}

// ─── Main Linter Runner ─────────────────────────────────────────────

/**
 * Run appropriate linters based on detected languages.
 * Returns findings in OpenGrepFinding-compatible format.
 */
export async function runLinterScan(
    targetPath: string,
    detectedLanguages: string[]
): Promise<LinterFinding[]> {
    console.log(`[Linter] Starting linter scan for languages: ${detectedLanguages.join(', ')}`);

    const allFindings: LinterFinding[] = [];
    const promises: Promise<LinterFinding[]>[] = [];

    // Run linters in parallel based on detected languages
    const hasJS = detectedLanguages.some(l => ['JavaScript', 'TypeScript'].includes(l));
    const hasPython = detectedLanguages.includes('Python');
    const hasGo = detectedLanguages.includes('Go');

    if (hasJS) promises.push(runESLint(targetPath));
    if (hasPython) promises.push(runRuff(targetPath));
    if (hasGo) promises.push(runGolangCILint(targetPath));

    if (promises.length === 0) {
        console.log('[Linter] No supported languages detected for linting.');
        return [];
    }

    const results = await Promise.allSettled(promises);

    for (const result of results) {
        if (result.status === 'fulfilled') {
            allFindings.push(...result.value);
        } else {
            console.warn('[Linter] A linter failed:', result.reason);
        }
    }

    console.log(`[Linter] Total linter findings: ${allFindings.length}`);
    return allFindings;
}
