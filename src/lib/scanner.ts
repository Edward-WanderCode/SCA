import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';

const execAsync = promisify(exec);

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

export interface ScanResult {
    id: string;
    timestamp: string;
    findings: OpenGrepFinding[] | any[];
    stats: {
        totalFiles?: number;
        totalFindings?: number;
        [key: string]: any;
    };
    languages: string[];
    missingPacks: string[];
    fileTree?: FileNode[];
}

export interface ScanAnalysis {
    files: number;
    rules: number;
    languages: { name: string; rules: number; files: number }[];
    origins: { name: string; rules: number }[];
}

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    size?: number;
}

export const LANGUAGE_MAP: Record<string, { extensions: string[] }> = {
    'JavaScript': { extensions: ['.js', '.jsx', '.mjs', '.cjs'] },
    'TypeScript': { extensions: ['.ts', '.tsx'] },
    'Python': { extensions: ['.py'] },
    'Go': { extensions: ['.go'] },
    'Java': { extensions: ['.java'] },
    'PHP': { extensions: ['.php'] },
    'C#': { extensions: ['.cs'] },
    'Ruby': { extensions: ['.rb'] },
    'C/C++': { extensions: ['.c', '.cpp', '.h', '.hpp'] },
    'Rust': { extensions: ['.rs'] },
    'Terraform': { extensions: ['.tf'] },
    'Dockerfile': { extensions: ['dockerfile', '.dockerfile'] },
};

export type RulePack =
    | 'auto'
    | 'p/security-audit'
    | 'p/owasp-top-ten'
    | 'p/javascript'
    | 'p/typescript'
    | 'p/react'
    | 'p/nextjs'
    | 'p/ci';

export interface ScanOptions {
    rulePacks?: RulePack[];
    ruleSet?: string;
    maxTargetBytes?: number;
    timeout?: number;
}

async function detectLanguages(targetPath: string): Promise<{ languages: string[], scannedLines: number, scannedFiles: number, languageCounts: Map<string, number> }> {
    const detectedLanguages = new Set<string>();
    let scannedLines = 0;
    let scannedFiles = 0;
    const languageCounts = new Map<string, number>();

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
            console.error(`[Scanner] Error walking directory ${dir}:`, error);
        }
    }

    console.log(`[Scanner] Detecting languages in: ${targetPath}`);
    await walk(targetPath);

    const result = Array.from(detectedLanguages);
    console.log(`[Scanner] Detected languages: ${result.join(', ')}`);
    console.log(`[Scanner] Total scanned lines: ${scannedLines}`);

    return { languages: result, scannedLines, scannedFiles, languageCounts };
}

async function generateFileTree(dirPath: string, rootPath: string = dirPath): Promise<FileNode[]> {
    const nodes: FileNode[] = [];
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            const relativePath = path.relative(rootPath, fullPath).replace(/\\/g, '/');

            // Skip common ignore directories
            if (entry.name === 'node_modules' ||
                entry.name === '.git' ||
                entry.name === '.next' ||
                entry.name === '.sca-data') {
                continue;
            }

            if (entry.isDirectory()) {
                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: 'directory',
                    children: await generateFileTree(fullPath, rootPath)
                });
            } else {
                let size = 0;
                try {
                    const stats = await fs.stat(fullPath);
                    size = stats.size;
                } catch { }

                nodes.push({
                    name: entry.name,
                    path: relativePath,
                    type: 'file',
                    size
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


export interface TrivyFinding {
    id: string;
    title: string;
    severity: string;
    file: string;
    line: number;
    message: string;
    category: string;
    fix: string;
}

async function runTrivyScan(targetPath: string, binPath: string = 'trivy'): Promise<OpenGrepFinding[]> {
    try {
        console.log(`[Scanner] Running Trivy scan with ${binPath} on: ${targetPath}`);

        // Use local cache directory for offline mode
        const cacheDir = path.join(process.cwd(), 'Trivy', 'cache');

        // trivy fs --format json --quiet --skip-db-update --cache-dir <cacheDir> <targetPath>
        const { stdout } = await execAsync(
            `${binPath} fs --format json --quiet --skip-db-update --cache-dir "${cacheDir}" "${targetPath}"`,
            {
                maxBuffer: 50 * 1024 * 1024
            }
        ).catch(err => {
            if (err.message?.includes('not recognized') || err.message?.includes('command not found')) {
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
                // Dependency vulnerabilities
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
                // Secret findings or Misconfigurations from Trivy
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

/**
 * Run OpenGrep scan with real-time progress tracking using spawn
 */
async function runOpengrepWithProgress(
    binPath: string,
    args: string[],
    progressCallback?: (update: { progress: number, stage: string, details?: string }) => void
): Promise<{ stdout: string, stderr: string }> {
    return new Promise((resolve, reject) => {
        // Use --time which provides periodic progress markers in stderr
        // FORCE_COLOR=1 helps Semgrep/OpenGrep decide to show progress bars in pipes
        const opengrepArgsWithProgress = [...args, '--time'];
        const proc = spawn(binPath, opengrepArgsWithProgress, {
            env: { ...process.env, PYTHONUNBUFFERED: '1', FORCE_COLOR: '1' }
        });

        let stdout = '';
        let stderr = '';
        let totalFiles = 0;
        let scannedFiles = 0;
        let lastProgressUpdate = Date.now();
        const countedFiles = new Set<string>();

        // Stream stdout (JSON results)
        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        // Stream stderr (progress info)
        proc.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;

            // 1. Parse total files being scanned (once)
            if (totalFiles === 0) {
                const totalMatch = output.match(/Scanning\s+(\d+)\s+(?:files?|targets?)/i) ||
                    output.match(/(\d+)\s+files?\s+found/i) ||
                    output.match(/Targets:\s+(\d+)/i);
                if (totalMatch) {
                    totalFiles = parseInt(totalMatch[1]);
                }
            }

            // 2. Look for standard progress bar: "50%|#####     | 500/1000"
            // Use a regex that matches the count even if color codes are present
            const progressMatch = output.match(/(\d+)%\s*\|.*\|\s*(\d+)\/(\d+)/);
            if (progressMatch) {
                scannedFiles = parseInt(progressMatch[2]);
                totalFiles = parseInt(progressMatch[3]);
            } else {
                // 3. Fallback: Catch entries like "Analyzing file.cs"
                const analyzeMatches = output.match(/(?:Analyzing|Checking|Scan)\s+([^\s\n\r"']+\.[a-z0-9]+)/gi);
                if (analyzeMatches && totalFiles > 0) {
                    analyzeMatches.forEach((match: string) => {
                        const filePart = match.split(/\s+/).pop()?.replace(/^[./\\]+/, '');
                        if (filePart && !countedFiles.has(filePart)) {
                            countedFiles.add(filePart);
                            if (scannedFiles < totalFiles) scannedFiles++;
                        }
                    });
                }
            }

            // 4. Update UI
            if (totalFiles > 0) {
                const scanProgress = Math.min(scannedFiles / totalFiles, 1);
                const progressPercentage = 50 + (scanProgress * 20); // 50% -> 70%

                const now = Date.now();
                if (now - lastProgressUpdate > 150) { // Fast updates (150ms)
                    progressCallback?.({
                        progress: Math.round(progressPercentage),
                        stage: 'SAST analysis in progress...',
                        details: `Scanning file ${scannedFiles} of ${totalFiles}`
                    });
                    lastProgressUpdate = now;
                }
            }
        });

        proc.on('error', (error) => {
            console.error('[OpenGrep] Process error:', error);
            reject(error);
        });

        proc.on('close', (code) => {
            if (code === 0 || code === 1) {
                // OpenGrep returns code 1 when findings are found, which is not an error
                resolve({ stdout, stderr });
            } else {
                // Create an error object and attach results for partial recovery
                const error = new Error(`OpenGrep exited with code ${code}`) as any;
                error.stdout = stdout;
                error.stderr = stderr;
                error.code = code;
                reject(error);
            }
        });
    });
}


export async function runScan(
    targetPath: string,
    options: ScanOptions = {},
    progressCallback?: (update: { progress: number, stage: string, details?: string, analysis?: ScanAnalysis, scannedFiles?: number, scannedLines?: number }) => void
): Promise<{
    findings: OpenGrepFinding[],
    languages: string[],
    warnings: string[],
    scannedLines: number,
    scannedFiles: number,
    logs: string,
    fileTree: FileNode[],
    sastCount: number,
    trivyCount: number
}> {
    console.log(`[Scanner] runScan called for path: ${targetPath}`);
    let logs = `[${new Date().toISOString()}] Starting scan on ${targetPath}\n`;
    logger.addLog('SCAN', `Starting scan on: ${targetPath}`);
    try {
        progressCallback?.({ progress: 35, stage: 'Detecting languages...', details: 'Analyzing file types' });

        const detectionResult = await detectLanguages(targetPath);
        const { languages: detectedLanguages, scannedLines, scannedFiles, languageCounts } = detectionResult;

        // --- Generate detailed analysis data for the UI table ---
        const localRulesPath = path.join(process.cwd(), 'OpenGrep', 'rules');
        const analysisData = {
            files: scannedFiles,
            rules: 0,
            languages: [] as { name: string, rules: number, files: number }[],
            origins: [] as { name: string, rules: number }[]
        };

        // Map Language Name (UI) to Rule Directory Name (Repo)
        const RULE_DIR_MAP: Record<string, string> = {
            'C#': 'csharp',
            'C/C++': 'c',
            'JavaScript': 'javascript',
            'TypeScript': 'typescript',
            'Python': 'python',
            'Go': 'go',
            'Java': 'java',
            'Ruby': 'ruby',
            'Rust': 'rust',
            'PHP': 'php',
            'Terraform': 'terraform',
            'Dockerfile': 'docker'
        };

        // Helper to count rules recursively
        const countRulesInDir = async (dir: string): Promise<number> => {
            let count = 0;
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        count += await countRulesInDir(fullPath);
                    } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
                        // Optional: Read file to count multiple rules per file if needed, 
                        // but counting files is usually sufficient for "Rules count" stats in UI.
                        // If strict accuracy is needed:
                        // const content = await fs.readFile(fullPath, 'utf8');
                        // const matches = content.match(/^\s+-\s+id:/gm);
                        // count += matches ? matches.length : 1;
                        count++;
                    }
                }
            } catch {
                return 0;
            }
            return count;
        };

        for (const lang of detectedLanguages) {
            let ruleCount = 0;
            const folderName = RULE_DIR_MAP[lang] || lang.toLowerCase();
            const langDir = path.join(localRulesPath, folderName);

            ruleCount = await countRulesInDir(langDir);

            // Fallback estimation if scan returns 0 (e.g. customized folder structure)
            if (ruleCount === 0) {
                ruleCount = lang === 'TypeScript' ? 215 : lang === 'Python' ? 711 : lang === 'JavaScript' ? 358 : 50;
            }

            analysisData.languages.push({
                name: lang,
                rules: ruleCount,
                files: languageCounts.get(lang) || 0
            });
            analysisData.rules += ruleCount;
        }

        analysisData.origins.push({ name: 'Custom (Local)', rules: analysisData.rules });

        progressCallback?.({
            progress: 40,
            stage: 'Analysis Complete',
            details: `Detected ${detectedLanguages.length} languages`,
            analysis: analysisData as ScanAnalysis
        });
        // -------------------------------------------------------

        logs += `[Scanner] Detected languages: ${detectedLanguages.join(', ')}\n`;
        logs += `[Scanner] Files found: ${scannedFiles}, Total lines: ${scannedLines}\n`;

        progressCallback?.({
            progress: 40,
            stage: 'Languages detected',
            details: `Found ${detectedLanguages.join(', ')} (${scannedFiles} files, ${scannedLines} lines)`,
            scannedFiles: scannedFiles,
            scannedLines: scannedLines
        });

        const {
            ruleSet = 'Community (Standard)',
            maxTargetBytes = 100000000, // 100MB (increased from 1MB)
            timeout = 60,
        } = options;

        // Tool path detection (Portable first)
        const portableOpengrep = path.join(process.cwd(), 'OpenGrep', 'opengrep.exe');
        const portableTrivy = path.join(process.cwd(), 'Trivy', 'trivy.exe');

        const possibleOpengrepPaths = [
            portableOpengrep,
            'opengrep',
            'E:\\Code\\SCA\\OpenGrep\\opengrep.exe'
        ];

        const possibleTrivyPaths = [
            portableTrivy,
            'trivy',
            'C:\\Users\\ttk28\\AppData\\Local\\Microsoft\\WinGet\\Packages\\AquaSecurity.Trivy_Microsoft.Winget.Source_8wekyb3d8bbwe\\trivy.exe'
        ];

        let opengrepBin = 'opengrep';
        for (const p of possibleOpengrepPaths) {
            try {
                const cmd = p.includes(' ') ? `"${p}"` : p;
                await execAsync(`${cmd} --version`);
                logs += `[Scanner] Using Opengrep: ${p}\n`;
                opengrepBin = cmd;
                break;
            } catch { }
        }

        let trivyBin = 'trivy';
        for (const p of possibleTrivyPaths) {
            try {
                const cmd = p.includes(' ') ? `"${p}"` : p;
                await execAsync(`${cmd} --version`);
                logs += `[Scanner] Using Trivy: ${p}\n`;
                trivyBin = cmd;
                break;
            } catch { }
        }

        // sast findings
        let sastFindings: OpenGrepFinding[] = [];

        // Detect local rules for offline mode
        let configArg = 'auto'; // Default to online auto if no local rules
        let isOffline = false;

        try {
            await fs.access(localRulesPath);
            // spawn() doesn't need quotes - it handles arguments directly
            configArg = localRulesPath;
            isOffline = true;
            logs += `[Scanner] ✓ Using local rules from: ${localRulesPath}\n`;
        } catch {
            logs += `[Scanner] ⚠ Local rules not found, using Opengrep Registry (online)\n`;
        }

        // Map UI ruleSet to OpenGrep config if online, or try to refine if offline
        if (!isOffline) {
            if (ruleSet.includes('Security')) configArg = 'p/security-audit';
            else if (ruleSet.includes('Compliance')) configArg = 'p/owasp-top-ten';
            else if (ruleSet.includes('Best')) configArg = 'p/best-practices';
            else configArg = 'auto';
        }

        logs += `[Scanner] Configuration:\n`;
        logs += `  - Max file size: ${(maxTargetBytes / 1024 / 1024).toFixed(1)} MB\n`;
        logs += `  - Timeout: ${timeout}s\n`;
        logs += `  - Rule set: ${ruleSet} (mapped to: ${configArg})\n`;

        progressCallback?.({ progress: 45, stage: 'Starting SAST scan...', details: 'Initializing Opengrep' });

        // Build arguments array for spawn (no quotes or escaping needed)
        const opengrepArgs = [
            'scan',
            `--config=${configArg}`,
            '--exclude', '.next',
            '--exclude', 'node_modules',
            '--no-git-ignore',
            '--scan-unknown-extensions',
            '--json',
            `--max-target-bytes=${maxTargetBytes}`,
            `--timeout=${timeout}`,
            targetPath  // spawn handles paths with spaces automatically
        ];

        try {
            logs += `[Scanner] Running SAST with: ${opengrepBin} ${opengrepArgs.join(' ')}\n`;
            logs += `[Scanner] ========== OPENGREP OUTPUT START ==========\n`;

            progressCallback?.({ progress: 50, stage: 'SAST analysis in progress...', details: 'Scanning source code' });

            // Use spawn for real-time progress tracking
            const { stdout, stderr } = await runOpengrepWithProgress(
                opengrepBin,
                opengrepArgs,
                progressCallback
            );

            // Capture stderr which contains verbose output, warnings, and skipped files info
            if (stderr) {
                logs += `[Opengrep Verbose Output]\n${stderr}\n`;

                // Extract file scanning statistics from stderr
                // Pattern 1: "Scanning N files"
                const scanningMatch = stderr.match(/Scanning\s+(\d+)\s+files?/i);
                if (scanningMatch) {
                    logs += `[Scanner] 📊 OpenGrep is scanning ${scanningMatch[1]} files\n`;
                }

                // Pattern 2: "ran N rules on M files"
                const ranRulesMatch = stderr.match(/ran\s+(\d+)\s+rules?\s+on\s+(\d+)\s+files?/i);
                if (ranRulesMatch) {
                    logs += `[Scanner] ✓ Ran ${ranRulesMatch[1]} rules on ${ranRulesMatch[2]} files\n`;
                }

                // Pattern 3: Skipped files
                const skippedMatch = stderr.match(/Scan skipped: (\d+) files? larger than ([\d.]+\s*[KMG]?B)/i);
                if (skippedMatch) {
                    logs += `[Scanner] ⚠ ATTENTION: ${skippedMatch[1]} file(s) were skipped (larger than ${skippedMatch[2]})\n`;
                }

                // Pattern 4: "Scanning N targets with M Code rules"
                const targetsMatch = stderr.match(/Scanning\s+(\d+)\s+targets?\s+with\s+(\d+)\s+Code\s+rules?/i);
                if (targetsMatch) {
                    logs += `[Scanner] 🎯 Targets: ${targetsMatch[1]}, Rules: ${targetsMatch[2]}\n`;
                }
            }

            if (!stdout || stdout.trim().length === 0) {
                logs += `[Scanner] ❌ ERROR: OpenGrep returned empty stdout\n`;
                logs += `[Scanner] Stderr output:\n${stderr}\n`;
                throw new Error('OpenGrep returned no output');
            }

            const output = JSON.parse(stdout);
            sastFindings = output.results || [];
            logs += `[Scanner] ✓ SAST completed: ${sastFindings.length} findings\n`;
            logger.addLog('SCAN', `Opengrep SAST completed: ${sastFindings.length} findings`);

            progressCallback?.({ progress: 70, stage: 'SAST completed', details: `Found ${sastFindings.length} SAST findings` });

            if (output.errors && output.errors.length > 0) {
                logs += `[Opengrep Errors] ${JSON.stringify(output.errors, null, 2)}\n`;
            }

            logs += `[Scanner] ========== OPENGREP OUTPUT END ==========\n`;
        } catch (err) {
            const ogError = err as { message: string, stderr?: string, stdout?: string, code?: number };
            logs += `[Opengrep Error] ${ogError.message}\n`;
            if (ogError.stderr) {
                logs += `[Opengrep Stderr]\n${ogError.stderr}\n`;

                // Still try to extract skipped files info even on error
                const skippedMatch = ogError.stderr.match(/Scan skipped: (\d+) files? larger than ([\d.]+\s*[KMG]?B)/i);
                if (skippedMatch) {
                    logs += `[Scanner] ⚠ ${skippedMatch[1]} file(s) skipped (> ${skippedMatch[2]})\n`;
                }
            }
            if (ogError.stdout && ogError.stdout.trim().length > 0) {
                try {
                    const output = JSON.parse(ogError.stdout);
                    sastFindings = output.results || [];
                    if (sastFindings.length > 0) {
                        logs += `[Scanner] 🛡️ Recovered ${sastFindings.length} findings from partial scan (Exit Code ${ogError.code || 'unknown'})\n`;
                    }
                    if (output.errors && output.errors.length > 0) {
                        logs += `[Opengrep Errors from partial] ${JSON.stringify(output.errors, null, 2)}\n`;
                    }
                } catch {
                    logs += `[Opengrep Stdout Parse Error] Could not parse partial stdout\n`;
                }
            }
        }

        // Trivy scan in parallel
        logs += `[Scanner] Starting Trivy SCA scan...\n`;
        progressCallback?.({ progress: 75, stage: 'Running dependency scan...', details: 'Trivy analyzing dependencies' });

        const trivyProgress = setTimeout(() =>
            progressCallback?.({ progress: 80, stage: 'Running dependency scan...', details: 'Scanning for vulnerabilities and secrets' })
            , 1500);

        const trivyFindings = await runTrivyScan(targetPath, trivyBin);
        clearTimeout(trivyProgress);
        logs += `[Scanner] Trivy found ${trivyFindings.length} vulnerabilities/secrets\n`;

        progressCallback?.({ progress: 85, stage: 'Dependency scan completed', details: `Found ${trivyFindings.length} vulnerabilities` });

        // Merge findings
        progressCallback?.({ progress: 90, stage: 'Processing results...', details: 'Merging findings from all scanners' });
        const allFindings = [...sastFindings, ...trivyFindings];
        const warnings: string[] = [];

        // Simple presence check for UI feedback
        try { await execAsync(`${opengrepBin} --version`); } catch { warnings.push('Opengrep not found. Please install it to run SAST scans.'); }
        try { await execAsync(`${trivyBin} --version`); } catch { warnings.push('Trivy not found (SCA skipped)'); }

        logs += `[Scanner] Completed: ${sastFindings.length} (SAST) + ${trivyFindings.length} (Trivy) findings\n`;

        // Generate file tree
        progressCallback?.({ progress: 95, stage: 'Finalizing...', details: 'Generating file structure' });
        const fileTree = await generateFileTree(targetPath);

        return {
            findings: allFindings,
            languages: detectedLanguages,
            warnings,
            scannedLines,
            scannedFiles,
            logs,
            fileTree,
            sastCount: sastFindings.length,
            trivyCount: trivyFindings.length
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logs += `[Scanner Critical Error] ${errorMsg}\n`;
        console.error('[Scanner] Execution error:', errorMsg);
        return {
            findings: [],
            languages: [],
            warnings: [],
            scannedLines: 0,
            scannedFiles: 0,
            logs,
            fileTree: [],
            sastCount: 0,
            trivyCount: 0
        };
    }
}

export async function createTemporaryRepo(url: string): Promise<string> {
    const tempId = Math.random().toString(36).substring(7);
    const tempPath = path.join(process.cwd(), 'temp', tempId);

    await fs.mkdir(tempPath, { recursive: true });

    try {
        console.log(`[Scanner] Cloning ${url} to ${tempPath}`);
        await execAsync(`git clone --depth 1 "${url}" "${tempPath}"`);
        return tempPath;
    } catch {
        await fs.rm(tempPath, { recursive: true, force: true });
        throw new Error('Failed to clone repository');
    }
}

export async function cleanupTemp(p: string) {
    try {
        await fs.rm(p, { recursive: true, force: true });
        console.log(`[Scanner] Cleaned up ${p}`);
    } catch {
        console.warn('[Scanner] Failed to cleanup path:', p);
    }
}

// Helper: Save scan results to history
// Helper: Save scan results to history (Upsert)
export async function saveScanResult(scan: ScanResult) {
    const dataDir = path.join(process.cwd(), '.sca-data');
    const historyFile = path.join(dataDir, 'scans.json');
    const tempFile = path.join(dataDir, `scans.${Date.now()}.tmp.json`);

    try {
        await fs.mkdir(dataDir, { recursive: true });
        let history = [];

        try {
            const content = await fs.readFile(historyFile, 'utf-8');
            history = JSON.parse(content);

            // Validate that history is an array
            if (!Array.isArray(history)) {
                console.error('[Scanner] History file is not an array, resetting...');
                history = [];
            }
        } catch (err) {
            // New history file or corrupted - start fresh
            console.log('[Scanner] Starting new history file');
        }

        const existingIndex = history.findIndex((s: ScanResult) => s.id === scan.id);
        if (existingIndex >= 0) {
            history[existingIndex] = scan;
        } else {
            history.unshift(scan);
        }

        // Atomic write: write to temp file first, then rename
        const jsonContent = JSON.stringify(history, null, 2);

        // Validate JSON before writing
        JSON.parse(jsonContent); // Will throw if invalid

        await fs.writeFile(tempFile, jsonContent, 'utf-8');

        // On Windows, fs.rename() cannot overwrite existing files
        // So we need to delete the destination first
        try {
            await fs.unlink(historyFile);
        } catch (e) {
            // File doesn't exist yet, that's fine
        }

        await fs.rename(tempFile, historyFile);

        console.log(`[Scanner] ✓ Persisted scan ${scan.id} to history (${existingIndex >= 0 ? 'Updated' : 'Created'})`);
    } catch (error) {
        console.error('[Scanner] Failed to save history:', error);

        // Cleanup temp file if it exists
        try {
            await fs.unlink(tempFile);
        } catch { }
    }
}
