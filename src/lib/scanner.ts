import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';
import {
    getFilesToScan,
    mergeFindingsIncremental,
    buildFileHashMap,
    FileHash
} from './incremental-scan';
import { runLinterScan } from './linter';

const execFileAsync = promisify(execFile);

export interface OpenGrepFinding {
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

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
}

export interface ScanAnalysis {
    files: number;
    rules: number;
    languages: { name: string, rules: number, files: number }[];
    origins: { name: string, rules: number }[];
    fileHashes?: FileHash[];
}

export interface ScanOptions {
    ruleSet?: string;
    maxTargetBytes?: number;
    timeout?: number;
    previousScanId?: string;
}

const LANGUAGE_MAP: Record<string, { extensions: string[], category: string }> = {
    'JavaScript': { extensions: ['.js', '.jsx'], category: 'Frontend' },
    'TypeScript': { extensions: ['.ts', '.tsx'], category: 'Frontend' },
    'Python': { extensions: ['.py'], category: 'Backend' },
    'Go': { extensions: ['.go'], category: 'Backend' },
    'Java': { extensions: ['.java'], category: 'Backend' },
    'PHP': { extensions: ['.php'], category: 'Backend' },
    'Ruby': { extensions: ['.rb'], category: 'Backend' },
    'C#': { extensions: ['.cs'], category: 'Backend' },
    'C++': { extensions: ['.cpp', '.cc', '.hpp'], category: 'System' },
    'C': { extensions: ['.c', '.h'], category: 'System' },
    'Rust': { extensions: ['.rs'], category: 'System' },
    'Docker': { extensions: ['dockerfile'], category: 'DevOps' },
    'Terraform': { extensions: ['.tf'], category: 'DevOps' },
    'Kubernetes': { extensions: ['.yaml', '.yml'], category: 'DevOps' },
};

async function detectLanguages(targetPath: string): Promise<{
    languages: string[],
    scannedLines: number,
    scannedFiles: number,
    languageCounts: Map<string, number>,
    allFiles: string[]
}> {
    const detectedLanguages = new Set<string>();
    let scannedLines = 0;
    let scannedFiles = 0;
    const languageCounts = new Map<string, number>();
    const allFiles: string[] = [];

    const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', '.sca-data', 'dist', 'build', 'vendor']);

    async function walk(dir: string) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                if (IGNORE_DIRS.has(entry.name)) continue;

                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await walk(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name).toLowerCase();
                    const base = entry.name.toLowerCase();
                    let isCodeFile = false;

                    for (const [lang, config] of Object.entries(LANGUAGE_MAP)) {
                        if (config.extensions.includes(ext) || config.extensions.includes(base)) {
                            detectedLanguages.add(lang);
                            languageCounts.set(lang, (languageCounts.get(lang) || 0) + 1);
                            isCodeFile = true;
                        }
                    }

                    if (isCodeFile) {
                        try {
                            const relativePath = path.relative(targetPath, fullPath).replace(/\\/g, '/');
                            allFiles.push(relativePath);
                            scannedFiles++;
                            const content = await fs.readFile(fullPath, 'utf-8');
                            scannedLines += content.split('\n').length;
                        } catch {
                            // Ignore read errors
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error walking directory ${dir}:`, error);
        }
    }

    await walk(targetPath);
    return {
        languages: Array.from(detectedLanguages),
        scannedLines,
        scannedFiles,
        languageCounts,
        allFiles
    };
}

async function generateFileTree(targetPath: string): Promise<FileNode[]> {
    const nodes: FileNode[] = [];
    const IGNORE_DIRS = new Set(['node_modules', '.git', '.next', '.sca-data', 'dist', 'build', 'vendor']);

    try {
        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        for (const entry of entries) {
            if (IGNORE_DIRS.has(entry.name)) continue;

            const fullPath = path.join(targetPath, entry.name);
            const relativePath = path.relative(targetPath, fullPath).replace(/\\/g, '/');

            if (entry.isDirectory()) {
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: 'directory',
                    children: await generateFileTree(fullPath)
                });
            } else {
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: 'file'
                });
            }
        }

        // Sort: directories first, then files
        nodes.sort((a, b) => {
            if (a.type === b.type) return a.name.localeCompare(b.name);
            return a.type === 'directory' ? -1 : 1;
        });

    } catch (error) {
        console.error('Error generating file tree:', error);
    }
    return nodes;
}

async function runTrivyScan(targetPath: string, binPath: string = 'trivy'): Promise<OpenGrepFinding[]> {
    try {
        console.log(`[Scanner] Running Trivy scan with ${binPath} on: ${targetPath}`);

        const cacheDir = path.join(process.cwd(), 'Trivy', 'cache');

        // SECURITY: Use execFileAsync with argument array to prevent shell injection
        const { stdout } = await execFileAsync(
            binPath.replace(/"/g, ''), // Strip any surrounding quotes from bin path
            ['fs', '--format', 'json', '--quiet', '--skip-db-update', '--cache-dir', cacheDir, targetPath],
            {
                maxBuffer: 50 * 1024 * 1024
            }
        ).catch(err => {
            if (err.code === 'ENOENT' || err.message?.includes('not recognized') || err.message?.includes('command not found')) {
                console.warn('[Scanner] Trivy not found. Skipping dependency scan.');
                return { stdout: '' };
            }
            throw err;
        });

        if (!stdout || stdout.trim() === '') return [];

        const data = JSON.parse(stdout);
        const findings: OpenGrepFinding[] = [];

        if (data.Results) {
            for (const result of data.Results) {
                if (result.Vulnerabilities) {
                    for (const v of result.Vulnerabilities) {
                        findings.push({
                            check_id: `trivy.${v.VulnerabilityID}`,
                            path: result.Target || 'dependencies',
                            start: { line: 0, col: 0 },
                            end: { line: 0, col: 0 },
                            extra: {
                                message: `[${v.PkgName}] ${v.Title || v.VulnerabilityID}: ${v.Description}`,
                                severity: v.Severity,
                                lines: `Version: ${v.InstalledVersion} -> Fixed in: ${v.FixedVersion || 'N/A'}`,
                                remediation: `Upgrade ${v.PkgName} to version ${v.FixedVersion || 'latest'}`,
                                metadata: {
                                    category: 'Vulnerability',
                                    cwe: v.CweIDs || []
                                }
                            }
                        });
                    }
                }
                if (result.Secrets) {
                    for (const s of result.Secrets) {
                        findings.push({
                            check_id: `trivy.secret.${s.RuleID}`,
                            path: result.Target,
                            start: { line: s.StartLine, col: 0 },
                            end: { line: s.EndLine, col: 0 },
                            extra: {
                                message: `Secret detected: ${s.Title}`,
                                severity: 'CRITICAL',
                                lines: 'REDACTED',
                                remediation: 'Revoke this secret and update your configuration.',
                                metadata: {
                                    category: 'Secret'
                                }
                            }
                        });
                    }
                }
            }
        }
        return findings;
    } catch (error) {
        console.warn('[Scanner] Trivy failed or not installed:', error instanceof Error ? error.message : String(error));
        return [];
    }
}

async function runTruffleHogScan(targetPath: string, binPath: string = 'trufflehog'): Promise<any[]> {
    try {
        console.log(`[Scanner] Running TruffleHog scan with ${binPath} on: ${targetPath}`);
        
        // SECURITY: Use execFileAsync with argument array to prevent shell injection
        const { stdout } = await execFileAsync(
            binPath.replace(/"/g, ''),
            ['filesystem', targetPath, '--no-update', '--json'],
            { maxBuffer: 50 * 1024 * 1024 }
        ).catch(err => {
            if (err.code === 'ENOENT' || err.message?.includes('not recognized') || err.message?.includes('command not found')) {
                console.warn('[Scanner] TruffleHog not found. Skipping secret scan.');
                return { stdout: '' };
            }
            if (err.stdout) return { stdout: err.stdout };
            throw err;
        });

        if (!stdout || stdout.trim() === '') return [];

        const findings: any[] = [];
        const lines = stdout.split('\n').filter((line: string) => line.trim().length > 0);
        
        for (const line of lines) {
            try {
                const data = JSON.parse(line);
                if (data.DetectorName) {
                    let codeSnippet = data.Raw?.trim() || 'REDACTED';
                    if (data.Raw === data.Redacted) {
                        codeSnippet = data.Redacted?.trim() || 'REDACTED';
                    } else if (data.Redacted) {
                        codeSnippet = data.Redacted.trim();
                    }

                    findings.push({
                        id: `scan-${Math.random().toString(36).substring(7)}`,
                        fingerprint: `trufflehog.${data.DetectorName}|${data.SourceMetadata?.Data?.Filesystem?.file || 'unknown'}|${data.DecoderName || ''}`,
                        isNew: false,
                        title: data.DetectorName,
                        severity: data.Verified ? 'critical' : 'high',
                        file: data.SourceMetadata?.Data?.Filesystem?.file || 'unknown',
                        line: parseInt(data.SourceMetadata?.Data?.Filesystem?.line) || 0,
                        column: 0,
                        message: `Secret detected: ${data.DetectorName}${data.Verified ? ' (VERIFIED ACTIVE)' : ''}`,
                        code: codeSnippet,
                        category: 'Secret',
                        fix: 'Revoke this secret, generate a new one, and inject it via environment variables or a secure vault.'
                    });
                }
            } catch (e) {}
        }
        return findings;
    } catch (error) {
        console.warn('[Scanner] TruffleHog failed:', error instanceof Error ? error.message : String(error));
        return [];
    }
}

async function runOpengrepWithProgress(
    binPath: string,
    args: string[],
    progressCallback?: (update: {
        progress: number,
        stage: string,
        details?: string,
        scannedFiles?: number,
        totalFiles?: number
    }) => void
): Promise<{ stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
        const opengrepArgsWithProgress = [...args, '--time'];
        const proc = spawn(binPath, opengrepArgsWithProgress, {
            env: { ...process.env, PYTHONUNBUFFERED: '1', FORCE_COLOR: '1' }
        });

        let stdout = '';
        let stderr = '';
        let totalFiles = 0;

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;

            // Detect total files from "Scanning N files..." pattern
            if (totalFiles === 0) {
                const totalMatch = output.match(/Scanning\s+(\d+)\s+files?\s+tracked by git/i) ||
                    output.match(/Scanning\s+(\d+)\s+(?:files?|targets?)/i) ||
                    output.match(/(\d+)\s+files?\s+found/i) ||
                    output.match(/Targets:\s+(\d+)/i);
                if (totalMatch) {
                    totalFiles = parseInt(totalMatch[1]);
                    console.log(`[OpenGrep] Total files to scan: ${totalFiles}`);

                    // Send one-time update with total files
                    progressCallback?.({
                        progress: 50,
                        stage: 'SAST analysis in progress...',
                        details: `Analyzing ${totalFiles} files`,
                        totalFiles: totalFiles
                    });
                }
            }


        });

        proc.on('error', (error) => {
            console.error('[OpenGrep] Process error:', error);
            reject(error);
        });

        proc.on('close', (code) => {
            // Send final progress update with total files scanned
            if (totalFiles > 0) {
                progressCallback?.({
                    progress: 90,
                    stage: 'SAST scan complete',
                    details: `Scanned ${totalFiles} files`,
                    scannedFiles: totalFiles,
                    totalFiles: totalFiles
                });
            }

            if (code === 0 || code === 1) {
                resolve({ stdout, stderr });
            } else {
                const error = new Error(`OpenGrep exited with code ${code}`) as any;
                error.stdout = stdout;
                error.stderr = stderr;
                error.code = code;
                reject(error);
            }
        });
    });
}

async function mapFindingsToUI(
    findings: any[],
    targetPath: string
): Promise<any[]> {
    return Promise.all(findings.map(async (f) => {
        if (f.file && f.line !== undefined && !f.check_id) {
            return f;
        }

        try {
            const fingerprint = `${f.check_id}|${f.path}|${(f.extra?.message || '').substring(0, 50)}`;

            let code = (f.extra?.rendered_lines || f.extra?.lines || 'No code snippet available').toString().trim();
            if (code === 'requires login' || code === 'required login') {
                try {
                    const fullPath = path.isAbsolute(f.path) ? f.path : path.join(targetPath, f.path);
                    const fileContent = await fs.readFile(fullPath, 'utf8');
                    const lines = fileContent.split('\n');
                    const startLine = Math.max(0, (f.start?.line || 1) - 1);
                    const endLine = Math.min(lines.length, (f.end?.line || f.start?.line || 1));
                    code = lines.slice(startLine, endLine).join('\n').trim();
                } catch (err) { }
            }

            const rawSev = (f.extra?.severity || 'LOW').toUpperCase();
            let mappedSev = 'low';
            if (['CRITICAL', 'FATAL'].includes(rawSev)) mappedSev = 'critical';
            else if (['ERROR', 'HIGH'].includes(rawSev)) mappedSev = 'high';
            else if (['WARNING', 'MEDIUM', 'WARN'].includes(rawSev)) mappedSev = 'medium';
            else if (['LOW'].includes(rawSev)) mappedSev = 'low';
            else if (['INFO'].includes(rawSev)) mappedSev = 'info';

            return {
                id: `scan-${Math.random().toString(36).substring(7)}`,
                fingerprint,
                isNew: false,
                title: f.check_id?.split('.').pop() || 'Issue',
                severity: mappedSev,
                file: f.path || 'unknown',
                line: f.start?.line || 0,
                column: f.start?.col || 0,
                message: f.extra?.message || 'No message provided',
                code: code || 'No code snippet available',
                category: f.extra?.metadata?.category || (f.check_id?.startsWith('trivy.') ? 'Vulnerability' : 'Security'),
                cwe: f.extra?.metadata?.cwe?.[0],
                owasp: f.extra?.metadata?.owasp?.[0],
                fix: f.extra?.remediation || 'Please review the security best practices.'
            };
        } catch (err) {
            console.error(`[Scanner] Error mapping finding:`, err);
            return null;
        }
    })).then(results => results.filter(f => f !== null));
}

export async function runScan(
    targetPath: string,
    options: ScanOptions = {},
    progressCallback?: (update: { progress: number, stage: string, details?: string, analysis?: ScanAnalysis, scannedFiles?: number, scannedLines?: number }) => void
): Promise<{
    findings: any[],
    languages: string[],
    warnings: string[],
    scannedLines: number,
    scannedFiles: number,
    logs: string,
    fileTree: FileNode[],
    sastCount: number,
    trivyCount: number,
    secretCount: number,
    linterCount: number,
    analysis?: any
}> {
    console.log(`[Scanner] runScan called for path: ${targetPath}`);
    let logs = `[${new Date().toISOString()}] Starting scan on ${targetPath}\n`;
    logger.addLog('SCAN', `Starting scan on: ${targetPath}`);

    try {
        progressCallback?.({ progress: 10, stage: 'Detecting languages...', details: 'Analyzing file types' });

        const detectionResult = await detectLanguages(targetPath);
        const { languages: detectedLanguages, scannedLines, scannedFiles, languageCounts, allFiles } = detectionResult;

        const {
            ruleSet = 'Community (Standard)',
            maxTargetBytes = 100000000,
            timeout = 60,
            previousScanId
        } = options;

        progressCallback?.({ progress: 20, stage: 'Checking for changes...', details: 'Comparing files with previous scan' });

        const incremental = await getFilesToScan(allFiles, targetPath, previousScanId);
        let filesToScan = incremental.filesToScan;
        let isIncremental = incremental.isIncremental;

        if (isIncremental) {
            logs += `[Incremental] 🚀 Incremental mode enabled!\n`;
            logs += `[Incremental] Files: ${incremental.stats.total} total, ${incremental.stats.changed.length} changed, ${incremental.stats.new.length} new, ${incremental.stats.deleted.length} deleted, ${incremental.stats.unchanged.length} unchanged.\n`;
            logs += `[Incremental] Only scanning ${filesToScan.length} files.\n`;
        } else {
            logs += `[Incremental] Full scan mode.\n`;
        }

        const analysisData: any = {
            files: scannedFiles,
            rules: 0,
            languages: [] as { name: string, rules: number, files: number }[],
            origins: [] as { name: string, rules: number }[]
        };

        for (const lang of detectedLanguages) {
            // Estimated rule counts from Semgrep Registry for reference
            const ruleCount = lang === 'TypeScript' ? 215 :
                lang === 'Python' ? 711 :
                    lang === 'JavaScript' ? 358 :
                        lang === 'Java' ? 450 :
                            lang === 'Go' ? 180 :
                                lang === 'PHP' ? 120 :
                                    lang === 'Ruby' ? 95 :
                                        50;

            analysisData.languages.push({
                name: lang, rules: ruleCount, files: languageCounts.get(lang) || 0
            });
            analysisData.rules += ruleCount;
        }

        analysisData.origins.push({ name: 'Semgrep Registry (Online)', rules: analysisData.rules });

        progressCallback?.({ progress: 30, stage: 'Calculating file hashes...', details: 'Indexing files for performance' });
        const finalHashMap = await buildFileHashMap(targetPath, allFiles);
        analysisData.fileHashes = Array.from(finalHashMap.values());

        progressCallback?.({
            progress: 40, stage: 'Analysis Complete',
            details: isIncremental ? `Incremental Scan (${filesToScan.length} files)` : `Detected ${detectedLanguages.length} languages`,
            analysis: analysisData as ScanAnalysis
        });

        logs += `[Scanner] Detected languages: ${detectedLanguages.join(', ')}\n`;
        logs += `[Scanner] Files found: ${scannedFiles}, Total lines: ${scannedLines}\n`;

        const portableOpengrep = path.join(process.cwd(), 'OpenGrep', 'opengrep.exe');
        const portableTrivy = path.join(process.cwd(), 'Trivy', 'trivy.exe');
        const portableTruffleHog = path.join(process.cwd(), 'TruffleHog', 'trufflehog.exe');
        const possibleOpengrepPaths = [portableOpengrep, 'opengrep'];
        const possibleTrivyPaths = [portableTrivy, 'trivy'];
        const possibleTruffleHogPaths = [portableTruffleHog, 'trufflehog'];

        // SECURITY: Use execFileAsync for version checks (no shell interpolation)
        let opengrepBin = 'opengrep';
        for (const p of possibleOpengrepPaths) {
            try {
                await execFileAsync(p, ['--version']);
                logs += `[Scanner] Using Opengrep: ${p}\n`;
                opengrepBin = p;
                break;
            } catch { }
        }

        let trivyBin = 'trivy';
        for (const p of possibleTrivyPaths) {
            try {
                await execFileAsync(p, ['--version']);
                logs += `[Scanner] Using Trivy: ${p}\n`;
                trivyBin = p;
                break;
            } catch { }
        }

        let trufflehogBin = 'trufflehog';
        for (const p of possibleTruffleHogPaths) {
            try {
                await execFileAsync(p, ['--version']);
                logs += `[Scanner] Using TruffleHog: ${p}\n`;
                trufflehogBin = p;
                break;
            } catch { }
        }

        let rawSastFindings: OpenGrepFinding[] = [];
        let configArg = 'auto'; // Default to auto (online registry)

        logs += `[Scanner] ☁️  Using Semgrep Registry (online mode)\n`;
        if (ruleSet.includes('Security')) configArg = 'p/security-audit';
        else if (ruleSet.includes('Compliance')) configArg = 'p/owasp-top-ten';
        else if (ruleSet.includes('Best')) configArg = 'p/best-practices';
        // else keep 'auto' for default registry rules

        progressCallback?.({ progress: 45, stage: 'Starting SAST scan...', details: isIncremental ? 'Incremental SAST scan' : 'Full SAST scan' });

        if (isIncremental && filesToScan.length === 0) {
            logs += `[Scanner] No files changed. Skipping SAST scan.\n`;
            rawSastFindings = [];
        } else {
            const opengrepArgs = [
                'scan', `--config=${configArg}`, '--exclude', '.next', '--exclude', 'node_modules',
                '--no-git-ignore', '--scan-unknown-extensions', '--json',
                `--max-target-bytes=${maxTargetBytes}`, `--timeout=${timeout}`
            ];

            if (isIncremental) {
                opengrepArgs.push(...filesToScan.map(f => path.join(targetPath, f)));
            } else {
                opengrepArgs.push(targetPath);
            }

            try {
                logs += `[Scanner] Running SAST with: ${opengrepBin} ${opengrepArgs.length > 20 ? opengrepArgs.slice(0, 10).join(' ') + ' ...' : opengrepArgs.join(' ')}\n`;
                const { stdout, stderr } = await runOpengrepWithProgress(opengrepBin, opengrepArgs, progressCallback);

                if (stderr) logs += `[Opengrep Verbose Output]\n${stderr}\n`;

                if (stdout && stdout.trim().length > 0) {
                    const output = JSON.parse(stdout);
                    rawSastFindings = output.results || [];
                    rawSastFindings = rawSastFindings.map(f => ({
                        ...f,
                        path: path.isAbsolute(f.path)
                            ? path.relative(targetPath, f.path).replace(/\\/g, '/')
                            : f.path.replace(/\\/g, '/')
                    }));
                }
            } catch (err) {
                const ogError = err as any;
                logs += `[Opengrep Error] ${ogError.message}\n`;
                if (ogError.stdout) {
                    try {
                        const output = JSON.parse(ogError.stdout);
                        rawSastFindings = output.results || [];
                        rawSastFindings = rawSastFindings.map(f => ({
                            ...f,
                            path: path.isAbsolute(f.path)
                                ? path.relative(targetPath, f.path).replace(/\\/g, '/')
                                : f.path.replace(/\\/g, '/')
                        }));
                    } catch { }
                }
            }
        }

        let finalSastFindings: any[] = [];
        if (isIncremental && incremental.oldFindings) {
            logs += `[Incremental] Merging ${rawSastFindings.length} new findings with previous findings...\n`;
            const newSastFindingsUI = await mapFindingsToUI(rawSastFindings, targetPath);
            const oldSastFindingsUI = incremental.oldFindings.filter((f: any) =>
                f.category !== 'Vulnerability' && f.category !== 'Secret'
            );
            finalSastFindings = mergeFindingsIncremental(
                oldSastFindingsUI,
                newSastFindingsUI,
                incremental.stats.changed,
                incremental.stats.deleted
            );
        } else {
            finalSastFindings = await mapFindingsToUI(rawSastFindings, targetPath);
        }

        progressCallback?.({ progress: 80, stage: 'Running dependency scan...', details: 'Trivy analyzing dependencies' });
        const trivyFindingsRaw = await runTrivyScan(targetPath, trivyBin);
        const trivyFindingsUI = await mapFindingsToUI(trivyFindingsRaw, targetPath);

        progressCallback?.({ progress: 85, stage: 'Running secret scan...', details: 'TruffleHog analyzing secrets' });
        const truffleHogFindingsUI = await runTruffleHogScan(targetPath, trufflehogBin);

        // Run linters for code quality analysis
        progressCallback?.({ progress: 88, stage: 'Running code quality linters...', details: 'Analyzing code style and best practices' });
        const linterFindingsRaw = await runLinterScan(targetPath, detectedLanguages);
        const linterFindingsUI = await mapFindingsToUI(linterFindingsRaw as any, targetPath);
        logs += `[Scanner] Linter findings: ${linterFindingsUI.length}\n`;

        const allFindings = [...finalSastFindings, ...trivyFindingsUI, ...truffleHogFindingsUI, ...linterFindingsUI];
        const warnings: string[] = [];
        try { await execFileAsync(opengrepBin, ['--version']); } catch { warnings.push('Opengrep not found'); }
        try { await execFileAsync(trivyBin, ['--version']); } catch { warnings.push('Trivy not found'); }
        try { await execFileAsync(trufflehogBin, ['--version']); } catch { warnings.push('TruffleHog not found'); }

        const fileTree = await generateFileTree(targetPath);

        return {
            findings: allFindings,
            languages: detectedLanguages,
            warnings,
            scannedLines,
            scannedFiles,
            logs,
            fileTree,
            sastCount: finalSastFindings.length,
            trivyCount: trivyFindingsUI.length,
            secretCount: truffleHogFindingsUI.length,
            linterCount: linterFindingsUI.length,
            analysis: analysisData
        };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logs += `[Scanner Critical Error] ${errorMsg}\n`;
        return {
            findings: [], languages: [], warnings: [], scannedLines: 0, scannedFiles: 0,
            logs, fileTree: [], sastCount: 0, trivyCount: 0, secretCount: 0, linterCount: 0
        };
    }
}

export async function createTemporaryRepo(url: string): Promise<string> {
    const tempId = Math.random().toString(36).substring(7);
    const tempPath = path.join(process.cwd(), 'temp', tempId);

    // Basic URL validation to prevent injection
    if (!/^https?:\/\/.+/i.test(url) && !/^git@.+/i.test(url)) {
        throw new Error(`Invalid repository URL: ${url}`);
    }

    await fs.mkdir(tempPath, { recursive: true });

    try {
        console.log(`[Scanner] Cloning ${url} to ${tempPath}`);
        // SECURITY: Use execFileAsync with argument array to prevent shell injection
        await execFileAsync('git', ['clone', '--depth', '1', url, tempPath]);
        return tempPath;
    } catch {
        throw new Error(`Failed to clone repository: ${url}`);
    }
}

export async function cleanupTemp(pathStr: string): Promise<void> {
    if (!pathStr.includes('temp')) {
        return;
    }

    const maxRetries = 3;
    const retryDelay = 1000; // 1 second

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Try force removal first
            await fs.rm(pathStr, { recursive: true, force: true, maxRetries: 3 });
            console.log(`[Cleanup] Successfully cleaned up: ${pathStr}`);
            return;
        } catch (err: any) {
            // If it's an ENOTEMPTY error and we have retries left, wait and retry
            if (err.code === 'ENOTEMPTY' && attempt < maxRetries - 1) {
                console.warn(`[Cleanup] Directory not empty (attempt ${attempt + 1}/${maxRetries}), retrying...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
                continue;
            }

            // Last resort: try manual recursive deletion
            if (attempt === maxRetries - 1) {
                console.warn(`[Cleanup] Standard removal failed, attempting manual cleanup...`);
                try {
                    await manualRecursiveDelete(pathStr);
                    console.log(`[Cleanup] Manual cleanup succeeded: ${pathStr}`);
                    return;
                } catch (manualErr) {
                    console.error(`[Cleanup] Manual cleanup also failed for ${pathStr}:`, manualErr);
                }
            }

            console.error(`Error cleaning up temp path ${pathStr}:`, err);
        }
    }
}

async function manualRecursiveDelete(dir: string): Promise<void> {
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await manualRecursiveDelete(fullPath);
            } else {
                try {
                    await fs.unlink(fullPath);
                } catch (unlinkErr) {
                    // Try changing permissions first on Windows
                    try {
                        await fs.chmod(fullPath, 0o666);
                        await fs.unlink(fullPath);
                    } catch {
                        // Ignore individual file errors, continue cleanup
                    }
                }
            }
        }

        // Try to remove the directory itself
        await fs.rmdir(dir);
    } catch (err) {
        // If directory doesn't exist or already deleted, that's fine
        if ((err as any).code !== 'ENOENT') {
            throw err;
        }
    }
}
