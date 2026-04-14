/**
 * SARIF (Static Analysis Results Interchange Format) Module
 * 
 * Converts internal SCA findings into SARIF 2.1.0 format.
 * This is the international standard for static analysis results,
 * compatible with GitHub Security, GitLab CI, Azure DevOps, etc.
 * 
 * Spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

// ─── SARIF Type Definitions ─────────────────────────────────────────

export interface SARIFLog {
    $schema: string;
    version: '2.1.0';
    runs: SARIFRun[];
}

export interface SARIFRun {
    tool: {
        driver: {
            name: string;
            version: string;
            semanticVersion?: string;
            informationUri?: string;
            rules: SARIFRule[];
        };
    };
    results: SARIFResult[];
    invocations: SARIFInvocation[];
    taxonomies?: SARIFToolComponent[];
}

export interface SARIFRule {
    id: string;
    name?: string;
    shortDescription: { text: string };
    fullDescription?: { text: string };
    helpUri?: string;
    defaultConfiguration?: {
        level: SARIFLevel;
    };
    properties?: {
        category?: string;
        tags?: string[];
        [key: string]: any;
    };
}

export interface SARIFResult {
    ruleId: string;
    ruleIndex?: number;
    level: SARIFLevel;
    message: { text: string };
    locations: SARIFLocation[];
    fixes?: SARIFFix[];
    fingerprints?: { [key: string]: string };
    properties?: {
        category?: string;
        source?: string;
        [key: string]: any;
    };
}

export interface SARIFLocation {
    physicalLocation: {
        artifactLocation: {
            uri: string;
            uriBaseId?: string;
        };
        region?: {
            startLine: number;
            startColumn?: number;
            endLine?: number;
            endColumn?: number;
            snippet?: { text: string };
        };
    };
}

export interface SARIFFix {
    description: { text: string };
    artifactChanges?: {
        artifactLocation: { uri: string };
        replacements: {
            deletedRegion: { startLine: number; startColumn?: number; endLine?: number; endColumn?: number };
            insertedContent?: { text: string };
        }[];
    }[];
}

export interface SARIFInvocation {
    executionSuccessful: boolean;
    startTimeUtc?: string;
    endTimeUtc?: string;
    toolExecutionNotifications?: {
        level: SARIFLevel;
        message: { text: string };
    }[];
    properties?: {
        [key: string]: any;
    };
}

export interface SARIFToolComponent {
    name: string;
    guid?: string;
    taxa?: {
        id: string;
        name: string;
        shortDescription?: { text: string };
    }[];
}

export type SARIFLevel = 'error' | 'warning' | 'note' | 'none';

// ─── Internal Types ─────────────────────────────────────────────────

interface InternalFinding {
    id?: string;
    fingerprint?: string;
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    message: string;
    category: string;
    file: string;
    line: number;
    column?: number;
    code?: string;
    fix?: string;
    cwe?: string;
    owasp?: string;
}

interface ScanData {
    id: string;
    timestamp: string;
    source: {
        name: string;
        type: string;
    };
    stats: {
        filesScanned: number;
        linesScanned: number | string;
        duration: number;
        findings: {
            critical: number;
            high: number;
            medium: number;
            low: number;
            info: number;
        };
        sastCount?: number;
        trivyCount?: number;
        secretCount?: number;
        linterCount?: number;
    };
    findings: InternalFinding[];
    languages?: string[];
}

// ─── Severity Mapping ───────────────────────────────────────────────

function mapSeverityToSARIF(severity: string): SARIFLevel {
    switch (severity.toLowerCase()) {
        case 'critical':
        case 'high':
            return 'error';
        case 'medium':
            return 'warning';
        case 'low':
            return 'note';
        case 'info':
            return 'none';
        default:
            return 'note';
    }
}

// ─── Convert to SARIF ───────────────────────────────────────────────

/**
 * Convert internal scan data to SARIF 2.1.0 format.
 * 
 * This produces a standards-compliant SARIF log that can be:
 * - Uploaded to GitHub Code Scanning (via GitHub Actions)
 * - Imported into GitLab CI/CD security dashboard
 * - Analyzed by any SARIF-compatible tool (VS Code SARIF Viewer, etc.)
 */
export function convertToSARIF(scanData: ScanData): SARIFLog {
    // Build unique rules map
    const rulesMap = new Map<string, SARIFRule>();
    const ruleIndices = new Map<string, number>();

    for (const finding of scanData.findings) {
        const ruleId = normalizeRuleId(finding);

        if (!rulesMap.has(ruleId)) {
            const ruleIndex = rulesMap.size;
            ruleIndices.set(ruleId, ruleIndex);

            rulesMap.set(ruleId, {
                id: ruleId,
                name: finding.title,
                shortDescription: { text: finding.title },
                fullDescription: { text: finding.message },
                defaultConfiguration: {
                    level: mapSeverityToSARIF(finding.severity),
                },
                properties: {
                    category: finding.category || 'Security',
                    tags: buildTags(finding),
                },
            });
        }
    }

    // Build results
    const results: SARIFResult[] = scanData.findings.map((finding) => {
        const ruleId = normalizeRuleId(finding);
        const result: SARIFResult = {
            ruleId,
            ruleIndex: ruleIndices.get(ruleId),
            level: mapSeverityToSARIF(finding.severity),
            message: { text: finding.message },
            locations: [
                {
                    physicalLocation: {
                        artifactLocation: {
                            uri: normalizeUri(finding.file),
                            uriBaseId: '%SRCROOT%',
                        },
                        region: {
                            startLine: Math.max(1, finding.line || 1),
                            startColumn: finding.column || undefined,
                            snippet: finding.code
                                ? { text: finding.code }
                                : undefined,
                        },
                    },
                },
            ],
            fingerprints: finding.fingerprint
                ? { 'sca/v1': finding.fingerprint }
                : undefined,
            properties: {
                category: finding.category,
                source: detectSource(finding),
                severity: finding.severity,
            },
        };

        // Add fix if available
        if (finding.fix) {
            result.fixes = [
                {
                    description: { text: finding.fix },
                },
            ];
        }

        return result;
    });

    // Build taxonomies for CWE references
    const cweTaxa: { id: string; name: string; shortDescription?: { text: string } }[] = [];
    const seenCWE = new Set<string>();

    for (const finding of scanData.findings) {
        if (finding.cwe && !seenCWE.has(finding.cwe)) {
            seenCWE.add(finding.cwe);
            cweTaxa.push({
                id: finding.cwe,
                name: finding.cwe,
                shortDescription: { text: `Common Weakness Enumeration: ${finding.cwe}` },
            });
        }
    }

    // Build invocations (metadata about the scan run)
    const invocations: SARIFInvocation[] = [
        {
            executionSuccessful: true,
            startTimeUtc: scanData.timestamp,
            properties: {
                projectName: scanData.source.name,
                scanType: scanData.source.type,
                filesScanned: scanData.stats.filesScanned,
                linesScanned: scanData.stats.linesScanned,
                durationSeconds: scanData.stats.duration,
                engines: {
                    sast: scanData.stats.sastCount || 0,
                    trivy: scanData.stats.trivyCount || 0,
                    secrets: scanData.stats.secretCount || 0,
                    linter: scanData.stats.linterCount || 0,
                },
                languages: scanData.languages || [],
            },
        },
    ];

    // Assemble final SARIF log
    const sarifLog: SARIFLog = {
        $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
        version: '2.1.0',
        runs: [
            {
                tool: {
                    driver: {
                        name: 'SCA Platform',
                        version: '1.0.0',
                        semanticVersion: '1.0.0',
                        informationUri: 'https://github.com/sca-platform',
                        rules: Array.from(rulesMap.values()),
                    },
                },
                results,
                invocations,
                ...(cweTaxa.length > 0
                    ? {
                        taxonomies: [
                            {
                                name: 'CWE',
                                guid: 'A9282C88-B1F4-4543-B566-D1E08A0C04F9',
                                taxa: cweTaxa,
                            },
                        ],
                    }
                    : {}),
            },
        ],
    };

    return sarifLog;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Generate a stable ruleId from the finding's metadata
 */
function normalizeRuleId(finding: InternalFinding): string {
    const title = finding.title || 'unknown';

    // If title already looks like a check_id (contains dots), use it
    if (title.includes('.') || title.includes('/')) {
        return title;
    }

    // Build a readable ruleId from category and title
    const category = (finding.category || 'general').toLowerCase().replace(/\s+/g, '-');
    const name = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    return `sca/${category}/${name}`;
}

/**
 * Normalize file paths to URI format for SARIF
 */
function normalizeUri(filePath: string): string {
    // Convert backslashes to forward slashes
    let uri = filePath.replace(/\\/g, '/');

    // Remove drive letter prefix if present (C:/ → just relative path)
    uri = uri.replace(/^[A-Za-z]:\//, '');

    // Remove leading slash if present
    uri = uri.replace(/^\//, '');

    return uri;
}

/**
 * Detect which scanning engine produced this finding
 */
function detectSource(finding: InternalFinding): string {
    const cat = (finding.category || '').toLowerCase();
    const title = (finding.title || '').toLowerCase();

    if (cat === 'vulnerability' || title.startsWith('cve-')) return 'trivy';
    if (cat === 'secret') return 'trufflehog';
    if (cat === 'code quality') return 'linter';
    return 'opengrep';
}

/**
 * Build SARIF tags from finding metadata
 */
function buildTags(finding: InternalFinding): string[] {
    const tags: string[] = [];

    if (finding.category) tags.push(finding.category.toLowerCase());
    if (finding.cwe) tags.push(finding.cwe);
    if (finding.owasp) tags.push(finding.owasp);

    const source = detectSource(finding);
    tags.push(`source:${source}`);

    return tags;
}
