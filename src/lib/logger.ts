// src/lib/logger.ts

type LogEntry = {
    timestamp: string;
    level: 'INFO' | 'SYSTEM' | 'REGISTRY' | 'SCAN' | 'ERROR';
    message: string;
};

type ScanProgress = {
    scanId: string;
    progress: number;
    stage: string;
    details?: string;
    analysis?: unknown;
};

class Logger {
    private logs: LogEntry[] = [];
    private maxLogs = 100;
    private listeners: ((log: LogEntry) => void)[] = [];
    private activeScans: Map<string, ScanProgress> = new Map();
    private progressListeners: ((update: ScanProgress) => void)[] = [];

    constructor() {
        this.addLog('SYSTEM', 'Antigravity SCA Agent backend initialized');
    }

    addLog(level: LogEntry['level'], message: string) {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message
        };

        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        this.listeners.forEach(listener => listener(entry));
        console.log(`[${entry.level}] ${message}`);
    }

    updateScanProgress(scanId: string, progress: number, stage: string, details?: string, analysis?: unknown) {
        const update: ScanProgress = { scanId, progress, stage, details, analysis };
        this.activeScans.set(scanId, update);
        console.log(`[PROGRESS] Scan ${scanId}: ${progress}% - ${stage} (${details || ''})`);
        this.progressListeners.forEach(listener => listener(update));
    }

    getScanProgress(scanId: string) {
        return this.activeScans.get(scanId);
    }

    removeActiveScan(scanId: string) {
        this.activeScans.delete(scanId);
    }

    getLogs() {
        return this.logs;
    }

    subscribe(callback: (log: LogEntry) => void) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(l => l !== callback);
        };
    }

    subscribeProgress(callback: (update: ScanProgress) => void) {
        this.progressListeners.push(callback);
        return () => {
            this.progressListeners = this.progressListeners.filter(l => l !== callback);
        };
    }
}

// Global singleton pattern for Next.js HMR
const globalForLogger = globalThis as unknown as { logger: Logger };
export const logger = globalForLogger.logger || new Logger();
if (process.env.NODE_ENV !== 'production') globalForLogger.logger = logger;
