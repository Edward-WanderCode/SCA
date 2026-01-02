// src/lib/rule-sources.ts

export const OPENGREP_REGISTRY = {
    name: 'Opengrep Registry',
    provider: 'Community',
    website: 'https://github.com/opengrep/opengrep',

    // Popular rule sets
    packs: {
        security: 'auto',
        owasp: 'auto',
        javascript: 'auto',
        typescript: 'auto',
        react: 'auto',
        nextjs: 'auto',
        golang: 'auto',
        python: 'auto',
        ci: 'auto',
    },

    // Get rules via API
    async fetchRules() {
        return {
            config: 'auto',
            command: `opengrep --config=auto`,
        };
    },

    // Opengrep is community driven
    apiEndpoint: 'https://github.com/opengrep/opengrep',
};

export const TRIVY_DB = {
    name: 'Trivy Vulnerability DB',
    provider: 'Aqua Security',
    website: 'https://aquasecurity.github.io/trivy/',
    features: [
        'SCA (Software Composition Analysis)',
        'Container Scanning',
        'Secret Scanning',
        'Config Auditing'
    ]
};

export const OWASP_RULES = {
    name: 'OWASP Security Rules',
    provider: 'OWASP Foundation',
    website: 'https://owasp.org/www-community/vulnerabilities/',

    // OWASP maintains curated rules for top vulnerabilities
    categories: [
        'injection',
        'broken-authentication',
        'sensitive-data-exposure',
        'xxe',
        'broken-access-control',
        'security-misconfiguration',
        'xss',
        'insecure-deserialization',
        'using-components-with-known-vulnerabilities',
        'insufficient-logging',
    ],
};

export const GITHUB_CODEQL = {
    name: 'GitHub CodeQL',
    provider: 'GitHub Security Lab',
    website: 'https://github.com/github/codeql',

    // CodeQL queries repository
    repository: 'github/codeql',
    queriesPath: 'https://github.com/github/codeql/tree/main',

    // Languages supported
    languages: [
        'javascript',
        'typescript',
        'python',
        'java',
        'csharp',
        'cpp',
        'go',
        'ruby',
    ],

    // Can be converted or used directly
    note: 'CodeQL queries can be adapted for multi-engine support',
};

export const SNYK_RULES = {
    name: 'Snyk Vulnerability Database',
    provider: 'Snyk',
    website: 'https://snyk.io/vuln/',

    // Snyk maintains extensive vulnerability database
    apiEndpoint: 'https://snyk.io/api/v1/vuln',
    features: [
        'Real-time vulnerability data',
        'Dependency scanning',
        'License compliance',
        'Container security',
    ],

    // Free tier available
    pricing: 'Free for open source projects',
};

export const CWE_CVE_DATABASES = {
    name: 'CWE/CVE Official Databases',
    providers: ['MITRE', 'NVD'],

    sources: {
        cwe: {
            name: 'Common Weakness Enumeration',
            website: 'https://cwe.mitre.org/',
            apiEndpoint: 'https://cwe.mitre.org/data/xml/',
        },
        cve: {
            name: 'Common Vulnerabilities and Exposures',
            website: 'https://nvd.nist.gov/',
            apiEndpoint: 'https://services.nvd.nist.gov/rest/json/cves/2.0',
        },
    },

    // Used as reference for creating custom rules
    usage: 'Reference database for vulnerability patterns',
};

// Recommended configuration for SCA project
export const RECOMMENDED_RULES_CONFIG = {
    primary: OPENGREP_REGISTRY,
    secondary: TRIVY_DB,

    // Multi-layer approach
    layers: [
        {
            priority: 'critical',
            source: 'Opengrep Auto',
            description: 'Static analysis for custom code',
        },
        {
            priority: 'critical',
            source: 'Trivy Vuln DB',
            description: 'SCA for external dependencies',
        }
    ],
};

// Auto-update mechanism
export async function checkForRuleUpdates() {
    return {
        status: 'automatic',
        message: 'Opengrep and Trivy DB support automatic updates and offline RulePack management.',
        lastCheck: new Date().toISOString(),
    };
}
