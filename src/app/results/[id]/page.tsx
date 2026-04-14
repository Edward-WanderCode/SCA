"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    ArrowLeft,
    GitBranch,
    Calendar,
    Clock,
    FileCode,
    Shield,
    AlertTriangle,
    Bug,
    Info,
    CheckCircle2,
    Download,
    Share2,
    ChevronDown,
    ChevronRight,
    Copy,
    Key,
    ExternalLink,
    Loader2,
    AlertCircle,
    Code2,
    FileText,
    Terminal,
    X,
    Send,
    FolderOpen,
    Settings
} from "lucide-react"
import { copyToClipboard } from '@/lib/clipboard'
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useParams } from "next/navigation"
import FileTree from "./FileTree"

interface Finding {
    id: string
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
    title: string
    message: string
    category: string
    file: string
    line: number
    column: number
    code: string
    fix?: string
    cwe?: string
    owasp?: string
}

export default function ResultsDetailPage() {
    const params = useParams()
    const scanId = params.id as string
    const [scanData, setScanData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [selectedSeverity, setSelectedSeverity] = useState<string>('all')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [expandedFinding, setExpandedFinding] = useState<string | null>(null)
    const [groupBy, setGroupBy] = useState<'none' | 'file' | 'rule'>('none')
    const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null)
    const [showLogModal, setShowLogModal] = useState(false)
    const [isScanning, setIsScanning] = useState(false)
    const [progress, setProgress] = useState(0)
    const [scanStage, setScanStage] = useState('')
    const [scanDetails, setScanDetails] = useState('')
    const [analysisData, setAnalysisData] = useState<any>(null)
    const [scannedFiles, setScannedFiles] = useState<number | undefined>(undefined)
    const [totalFiles, setTotalFiles] = useState<number | undefined>(undefined)
    const [basePath, setBasePath] = useState<string>('')
    const [sendingToTelegram, setSendingToTelegram] = useState(false)
    const [telegramMessage, setTelegramMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [selectedEditor, setSelectedEditor] = useState<string>('vscode')
    const [showEditorSettings, setShowEditorSettings] = useState(false)

    // Load editor preference from localStorage
    useEffect(() => {
        const savedEditor = localStorage.getItem('preferredEditor');
        if (savedEditor) {
            setSelectedEditor(savedEditor);
        }
    }, []);

    const saveEditorPreference = (editor: string) => {
        setSelectedEditor(editor);
        localStorage.setItem('preferredEditor', editor);
        setShowEditorSettings(false);
    };

    // Helper to normalize path separators
    const normalizePath = (path: string) => path.replace(/\\/g, '/');

    // Helper to remove base path from a file path
    const removeBasePath = (path: string, base: string) => {
        const normalized = normalizePath(path);
        if (base && normalized.startsWith(base + '/')) {
            return normalized.substring(base.length + 1);
        }
        return normalized;
    };

    // Build file tree from findings if not available
    const buildFileTreeFromFindings = (findings: any[]) => {
        if (!findings || findings.length === 0) return [];

        const tree: any = {};

        findings.forEach((finding: any) => {
            // Normalize path separators to forward slash
            let normalizedPath = finding.file.replace(/\\/g, '/');

            // Remove base path if it exists (use basePath from state)
            if (basePath && normalizedPath.startsWith(basePath + '/')) {
                normalizedPath = normalizedPath.substring(basePath.length + 1);
            }

            // Skip if path is empty after removing base
            if (!normalizedPath) return;

            const parts = normalizedPath.split('/');
            let current = tree;

            parts.forEach((part: string, index: number) => {
                if (!current[part]) {
                    current[part] = {
                        name: part,
                        path: parts.slice(0, index + 1).join('/'),
                        type: index === parts.length - 1 ? 'file' : 'directory',
                        children: {}
                    };
                }
                current = current[part].children;
            });
        });

        const convertToArray = (obj: any): any[] => {
            return Object.values(obj).map((node: any) => ({
                ...node,
                children: node.type === 'directory' ? convertToArray(node.children) : undefined
            })).filter((node: any) => node.type === 'directory' || node.type === 'file');
        };

        return convertToArray(tree);
    };

    // Reset selected group when grouping changes
    useEffect(() => {
        setSelectedGroupName(null)
    }, [groupBy])

    // Calculate base path when scanData changes
    useEffect(() => {
        if (scanData && scanData.findings && scanData.findings.length > 0) {
            const normalizedPaths = scanData.findings.map((f: any) => f.file.replace(/\\/g, '/'));
            const absolutePaths = normalizedPaths.filter((p: string) => p.match(/^[A-Za-z]:\//));

            let calculatedBase = '';

            if (absolutePaths.length > 0) {
                const parts = absolutePaths[0].split('/');

                // Find the longest common prefix among absolute paths
                for (let i = parts.length - 1; i >= 0; i--) {
                    const prefix = parts.slice(0, i).join('/');
                    if (absolutePaths.every((p: string) => p.startsWith(prefix + '/') || p === prefix)) {
                        calculatedBase = prefix;
                        break;
                    }
                }
            }

            // After removing base path, check if all remaining paths start with the same folder
            const pathsAfterBase = normalizedPaths.map((p: string) => {
                if (calculatedBase && p.startsWith(calculatedBase + '/')) {
                    return p.substring(calculatedBase.length + 1);
                }
                return p;
            }).filter((p: string) => p.length > 0);

            if (pathsAfterBase.length > 0) {
                // Get the first folder of each path
                const firstFolders = pathsAfterBase.map((p: string) => p.split('/')[0]);
                const uniqueFolders = new Set(firstFolders);

                // If all paths start with the same single folder, include it in base path
                if (uniqueFolders.size === 1) {
                    const commonFolder = Array.from(uniqueFolders)[0] as string;
                    calculatedBase = calculatedBase ? `${calculatedBase}/${commonFolder}` : commonFolder;
                }
            }

            setBasePath(calculatedBase);
        }
    }, [scanData])

    const fetchScanDetail = async () => {
        try {
            const response = await fetch('/api/history')
            const data = await response.json()
            if (data.success) {
                let scan;
                if (scanId.startsWith('scan-')) {
                    scan = data.history.find((h: any) => h.id === scanId)
                } else {
                    scan = data.history.find((h: any) => h.findings.some((f: any) => f.id === scanId));
                    if (scan) {
                        setExpandedFinding(scanId);
                    }
                }

                if (scan) {
                    setScanData(scan)
                    // Restore analysis data from database if available
                    if (scan.analysis) {
                        setAnalysisData(scan.analysis)
                    }
                    if (scan.status === 'running') {
                        setIsScanning(true)
                    } else {
                        setIsScanning(false)
                    }

                    // Also update progress and stage if it's currently running
                    if (scan.lastProgress !== undefined) setProgress(scan.lastProgress);
                    if (scan.lastStage) setScanStage(scan.lastStage);
                    if (scan.lastDetails) setScanDetails(scan.lastDetails);
                    if (scan.filesScanned !== undefined) setScannedFiles(scan.filesScanned);
                } else if (scanId.startsWith('scan-')) {
                    // Fallback: If not in history yet but has scanId prefix, it might be just starting
                    setIsScanning(true)
                }
            }
        } catch (error) {
            console.error('Failed to fetch scan detail:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleOpenFileLocation = async (filePath: string) => {
        try {
            const response = await fetch('/api/utils/open-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath,
                    sourcePath: scanData.source.path
                })
            });
            const data = await response.json();
            if (!data.success) {
                alert(data.error || 'Failed to open file location');
            }
        } catch (error) {
            console.error('Error calling open-file API:', error);
            alert('Failed to connect to the server');
        }
    };

    const handleOpenInEditor = async (filePath: string, line: number, column: number) => {
        try {
            const response = await fetch('/api/utils/open-editor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filePath,
                    sourcePath: scanData.source.path,
                    line,
                    column,
                    editor: selectedEditor
                })
            });
            const data = await response.json();
            if (!data.success) {
                alert(data.error || 'Failed to open in editor');
            }
        } catch (error) {
            console.error('Error calling open-editor API:', error);
            alert('Failed to connect to the server');
        }
    };

    useEffect(() => {
        if (scanId) {
            fetchScanDetail()
        }
    }, [scanId])

    useEffect(() => {
        if (isScanning && scanId) {
            const eventSource = new EventSource(`/api/scan/progress?id=${scanId}`);

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.progress !== undefined) setProgress(data.progress);
                if (data.stage) setScanStage(data.stage);
                if (data.details) setScanDetails(data.details);
                if (data.analysis) setAnalysisData(data.analysis);

                if (data.error) {
                    setScanDetails(`Error: ${data.error}`);
                    setScanStage('Scan Interrupted');
                    eventSource.close();
                    setIsScanning(false);
                    return;
                }

                if (data.progress >= 100) {
                    eventSource.close();
                    setIsScanning(false);
                    // Refresh and show actual findings
                    fetchScanDetail();
                }
            };

            eventSource.onerror = (err) => {
                console.error("EventSource failed:", err);
                eventSource.close();
                // Might be finished or error
                fetchScanDetail();
            };

            return () => eventSource.close();
        }
    }, [isScanning, scanId]);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-vh-50 gap-4 py-20">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-muted-foreground animate-pulse">Fetching scan results...</p>
            </div>
        )
    }

    if (!scanData) {
        return (
            <div className="flex flex-col items-center justify-center min-vh-50 gap-4 py-20 text-center">
                <AlertCircle className="w-16 h-16 text-red-500" />
                <h2 className="text-2xl font-bold">Scan Not Found</h2>
                <p className="text-muted-foreground max-w-md">
                    The requested scan results could not be found or may have been deleted.
                </p>
                <Link href="/history" className="px-6 py-2 bg-indigo-600 rounded-lg mt-4 text-white hover:bg-indigo-700 transition-colors">
                    Back to History
                </Link>
            </div>
        )
    }

    const filteredFindings = scanData.findings.filter((f: any) => {
        const matchesSeverity = selectedSeverity === 'all' || f.severity === selectedSeverity
        const matchesCategory = selectedCategory === 'all' || f.category === selectedCategory
        return matchesSeverity && matchesCategory
    })

    const severityColors = {
        critical: 'text-red-500 bg-red-500/10 border-red-500/20',
        high: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
        medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
        low: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
        info: 'text-gray-500 bg-gray-500/10 border-gray-500/20'
    }

    const severityIcons = {
        critical: AlertTriangle,
        high: Shield,
        medium: Bug,
        low: Info,
        info: Info
    }

    const renderNoFindings = () => (
        <div className="glass-card p-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Không tìm thấy lỗi nào phù hợp</h3>
            <p className="text-muted-foreground">Vui lòng điều chỉnh lại bộ lọc hoặc chế độ nhóm của bạn.</p>
        </div>
    )

    const renderFinding = (finding: any, index: number) => {
        const sevKey = finding.severity as keyof typeof severityIcons
        const Icon = severityIcons[sevKey] || Info
        const isExpanded = expandedFinding === finding.id

        return (
            <motion.div
                key={finding.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.05, 1) }}
                className={cn(
                    "glass-card overflow-hidden border-l-4",
                    severityColors[sevKey] || 'border-gray-500/20'
                )}
            >
                {/* Finding Header */}
                <div
                    className="p-4 md:p-6 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedFinding(isExpanded ? null : finding.id)}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                <Icon className="w-5 h-5 flex-shrink-0" />
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                    severityColors[sevKey] || severityColors.info
                                )}>
                                    {finding.severity}
                                </span>
                                {finding.isNew && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500 text-white animate-pulse">
                                        New Issue
                                    </span>
                                )}
                                {!finding.isNew && scanData.isRescan && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-700 text-slate-300">
                                        Persistent
                                    </span>
                                )}
                                <span className="text-xs text-muted-foreground truncate">{finding.category}</span>
                            </div>
                            <h3 className="text-base md:text-lg font-bold mb-1 line-clamp-1">{finding.title}</h3>
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{finding.message}</p>
                            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                                <div className="flex items-center gap-1 bg-black/30 pl-2 pr-1 py-1 rounded border border-white/5">
                                    <FileCode className="w-3 h-3" />
                                    <span className="truncate max-w-[200px] md:max-w-md">
                                        {finding.file}:{finding.line}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenFileLocation(finding.file);
                                        }}
                                        className="p-1 hover:bg-white/10 rounded-md text-indigo-400 transition-colors ml-1"
                                        title="Show in Explorer"
                                    >
                                        <FolderOpen className="w-3 h-3" />
                                    </button>
                                </div>
                                {finding.cwe && (
                                    <span className="text-indigo-400">{finding.cwe}</span>
                                )}
                                {finding.owasp && (
                                    <span className="text-indigo-400">{finding.owasp}</span>
                                )}
                            </div>
                        </div>
                        <button className="p-2 flex-shrink-0">
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {/* Finding Details (Expanded) */}
                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="border-t border-white/10"
                    >
                        <div className="p-4 md:p-6 space-y-6">
                            {/* Vulnerable Code */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold">Vulnerable Code</h4>
                                    <button
                                        onClick={async () => {
                                            const success = await copyToClipboard(finding.code);
                                            if (!success) {
                                                alert('Failed to copy to clipboard');
                                            }
                                        }}
                                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                    >
                                        <Copy className="w-3 h-3" />
                                        Copy
                                    </button>
                                </div>
                                <div className="bg-[#0f172a] border border-white/10 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                                    <pre className="text-red-400">
                                        <code>{finding.code}</code>
                                    </pre>
                                </div>
                            </div>

                            {/* Fix Suggestion */}
                            {finding.fix && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-semibold text-emerald-500">Suggested Fix</h4>
                                        <button
                                            onClick={async () => {
                                                const success = await copyToClipboard(finding.fix);
                                                if (!success) {
                                                    alert('Failed to copy to clipboard');
                                                }
                                            }}
                                            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                        >
                                            <Copy className="w-3 h-3" />
                                            Copy
                                        </button>
                                    </div>
                                    <div className="bg-[#0f172a] border border-white/10 rounded-lg p-4 font-mono text-sm overflow-x-auto">
                                        <pre className="text-emerald-400">
                                            <code>{finding.fix}</code>
                                        </pre>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex flex-wrap gap-3 pt-4 border-t border-white/10">
                                <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Mark as Fixed
                                </button>
                                <button
                                    onClick={() => handleOpenInEditor(finding.file, finding.line, finding.column)}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-medium rounded-lg text-sm transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    View in Editor
                                </button>
                                <button
                                    onClick={() => handleOpenFileLocation(finding.file)}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-medium rounded-lg text-sm transition-colors"
                                >
                                    <FolderOpen className="w-4 h-4" />
                                    Open Folder
                                </button>
                                <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-medium rounded-lg text-sm transition-colors md:ml-auto">
                                    False Positive
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </motion.div>
        )
    }

    const totalFindingsCount = Object.values(scanData.stats.findings as Record<string, number>).reduce((a, b) => a + b, 0)

    if (isScanning) {
        return (
            <div className="max-w-4xl mx-auto py-12">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-card p-12 flex flex-col gap-8 min-h-[500px]"
                >
                    <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full border-4 border-white/5 flex items-center justify-center">
                                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold">{scanStage || 'Analysis in Progress'}</h2>
                                <p className="text-sm text-muted-foreground">
                                    {scanDetails || 'Running Opengrep & Trivy rules...'}
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={cn(
                                "text-3xl font-mono font-bold",
                                scanStage === 'Scan Interrupted' ? 'text-red-500' : 'text-indigo-500'
                            )}>
                                {Math.round(progress)}%
                            </div>
                            <div className="text-xs text-muted-foreground uppercase tracking-widest flex items-center justify-end gap-1.5">
                                <div className={cn(
                                    "w-1.5 h-1.5 rounded-full animate-pulse",
                                    scanStage === 'Scan Interrupted' ? 'bg-red-500' : 'bg-indigo-500'
                                )}></div>
                                <span>Progress</span>
                            </div>
                            {totalFiles !== undefined && (
                                <div className="text-xs text-muted-foreground mt-1">
                                    {scannedFiles || 0} / {totalFiles} files
                                </div>
                            )}
                        </div>
                    </div>

                    {scanStage === 'Scan Interrupted' && (
                        <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl flex flex-col items-center gap-4 text-center">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                            <div>
                                <h3 className="text-lg font-bold text-red-400">Scan has been interrupted</h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                    The active connection was lost. This usually happens if the page is refreshed during a long scan.
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    const method = scanData.source.type;
                                    const path = scanData.source.path || scanData.source.url;
                                    window.location.href = `/scan?method=${method}&path=${encodeURIComponent(path)}&compareWithId=${scanData.comparedWithId || ''}`;
                                }}
                                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors"
                            >
                                Start New Scan
                            </button>
                        </div>
                    )}

                    {/* Detailed Analysis Table (Terminal Style) */}
                    {analysisData && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full bg-black/40 rounded-lg border border-white/10 p-6 font-mono text-xs overflow-hidden"
                        >
                            <div className="mb-4 text-white/60">
                                Scanning {analysisData.files} files (only git-tracked) with {analysisData.rules} Code rules:
                            </div>

                            <div className="grid grid-cols-2 gap-12">
                                <div>
                                    <div className="flex border-b border-white/20 pb-2 mb-2 text-white/40 uppercase">
                                        <span className="w-1/3">Language</span>
                                        <span className="w-1/3 text-right">Rules</span>
                                        <span className="w-1/3 text-right">Files</span>
                                    </div>
                                    <div className="space-y-1.5 h-[180px] overflow-y-auto no-scrollbar">
                                        {analysisData.languages.map((lang: any, i: number) => (
                                            <div key={i} className="flex text-white/80">
                                                <span className="w-1/3">{lang.name}</span>
                                                <span className="w-1/3 text-right">{lang.rules}</span>
                                                <span className="w-1/3 text-right">{lang.files}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex border-b border-white/20 pb-2 mb-2 text-white/40 uppercase">
                                        <span className="w-2/3">Origin</span>
                                        <span className="w-1/3 text-right">Rules</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {analysisData.origins.map((origin: any, i: number) => (
                                            <div key={i} className="flex text-white/80">
                                                <span className="w-2/3">{origin.name}</span>
                                                <span className="w-1/3 text-right">{origin.rules}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    <div className="w-full space-y-2">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-muted-foreground">
                            <span>Progress</span>
                            <span>{progress >= 99 ? '0:00:00' : 'Calculating time...'}</span>
                        </div>
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 relative"
                                style={{ backgroundSize: '200% 100%' }}
                                initial={{ width: 0 }}
                                animate={{
                                    width: `${progress}%`,
                                    backgroundPosition: ['0% 0%', '100% 0%']
                                }}
                                transition={{
                                    width: { duration: 0.8, ease: "easeInOut" },
                                    backgroundPosition: { duration: 2, repeat: Infinity, ease: "linear" }
                                }}
                            />
                        </div>
                    </div>
                </motion.div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/history"
                        className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate max-w-[300px] md:max-w-none">
                            {scanData.source.name}
                        </h1>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1 uppercase">
                                <GitBranch className="w-3 h-3" />
                                {scanData.source.type}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(scanData.timestamp).toLocaleString()}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {scanData.stats.duration}s
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <FileCode className="w-3 h-3" />
                                {scanData.stats.filesScanned?.toLocaleString() || 0} files
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" />
                                {scanData.stats.linesScanned?.toLocaleString() || 0} lines
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowEditorSettings(true)}
                        className="p-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white rounded-lg transition-colors"
                        title="Editor Settings"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setShowLogModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                        <Terminal className="w-4 h-4" />
                        Scan Logs
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-medium rounded-lg transition-colors text-sm">
                        <Share2 className="w-4 h-4" />
                        Share
                    </button>
                    <button
                        onClick={async () => {
                            setSendingToTelegram(true)
                            setTelegramMessage(null)

                            try {
                                const response = await fetch('/api/telegram/send', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ scanId: scanData.id })
                                })

                                const data = await response.json()

                                if (!response.ok) {
                                    throw new Error(data.error || 'Failed to send to Telegram')
                                }

                                setTelegramMessage({
                                    type: 'success',
                                    text: '✅ PDF report sent to Telegram successfully!'
                                })

                                // Auto-dismiss success message after 5 seconds
                                setTimeout(() => setTelegramMessage(null), 5000)
                            } catch (error: any) {
                                setTelegramMessage({
                                    type: 'error',
                                    text: error.message || 'Failed to send to Telegram'
                                })
                            } finally {
                                setSendingToTelegram(false)
                            }
                        }}
                        disabled={sendingToTelegram}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors text-sm"
                    >
                        {sendingToTelegram ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Send to Telegram
                            </>
                        )}
                    </button>
                    <button
                        onClick={() => {
                            const { exportScanToPDF } = require('@/lib/pdf-export');
                            exportScanToPDF(scanData);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors text-sm"
                    >
                        <Download className="w-4 h-4" />
                        Export PDF
                    </button>
                    <button
                        onClick={() => {
                            window.open(`/api/scan/sarif?id=${scanData.id}`, '_blank');
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors text-sm"
                        title="Export as SARIF 2.1.0 (compatible with GitHub, GitLab, Azure DevOps)"
                    >
                        <Download className="w-4 h-4" />
                        Export SARIF
                    </button>
                </div>
            </div>

            {/* Telegram Message Notification */}
            {telegramMessage && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`p-4 rounded-lg flex items-center gap-3 ${telegramMessage.type === 'success'
                        ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border border-red-500/20 text-red-400'
                        }`}
                >
                    {telegramMessage.type === 'success' ? (
                        <CheckCircle2 className="w-5 h-5" />
                    ) : (
                        <AlertCircle className="w-5 h-5" />
                    )}
                    <span>{telegramMessage.text}</span>
                    <button
                        onClick={() => setTelegramMessage(null)}
                        className="ml-auto p-1 hover:bg-white/10 rounded transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </motion.div>
            )}
            {/* Editor Settings Modal */}
            {showEditorSettings && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card w-full max-w-md p-6 space-y-6"
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Settings className="w-5 h-5 text-indigo-400" />
                                Editor Settings
                            </h3>
                            <button onClick={() => setShowEditorSettings(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Chọn IDE/Editor bạn muốn sử dụng khi nhấn "View in Editor".
                        </p>

                        <div className="space-y-2">
                            {[
                                { id: 'vscode', name: 'Visual Studio Code', icon: '💻' },
                                { id: 'cursor', name: 'Cursor AI', icon: '🤖' },
                                { id: 'webstorm', name: 'WebStorm', icon: '🌐' },
                                { id: 'intellij', name: 'IntelliJ IDEA', icon: '☕' },
                                { id: 'sublime', name: 'Sublime Text', icon: '📝' },
                                { id: 'notepadpp', name: 'Notepad++', icon: '📄' },
                            ].map((editor) => (
                                <button
                                    key={editor.id}
                                    onClick={() => saveEditorPreference(editor.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                                        selectedEditor === editor.id
                                            ? "bg-indigo-600/20 border-indigo-500/50 text-indigo-100"
                                            : "hover:bg-white/5 border-white/5 text-slate-400"
                                    )}
                                >
                                    <span className="text-xl">{editor.icon}</span>
                                    <span className="font-medium">{editor.name}</span>
                                    {selectedEditor === editor.id && (
                                        <CheckCircle2 className="w-4 h-4 ml-auto text-indigo-400" />
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="pt-4 border-t border-white/10 text-[10px] text-muted-foreground italic">
                            * Lưu ý: Editor được chọn phải được cài đặt trong PATH hệ thống.
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Scan Log Modal */}
            {showLogModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden"
                    >
                        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-600/20 to-purple-600/20">
                            <div className="flex items-center gap-3">
                                <Terminal className="w-5 h-5 text-indigo-400" />
                                <div>
                                    <h3 className="font-bold text-lg">Scan Output Logs</h3>
                                    <p className="text-xs text-muted-foreground">Detailed execution trace • OpenGrep + Trivy</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={async () => {
                                        const success = await copyToClipboard(scanData?.logs || 'No logs available');
                                        if (success) {
                                            console.log('Logs copied to clipboard');
                                        } else {
                                            alert('Failed to copy to clipboard');
                                        }
                                    }}
                                    className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5"
                                >
                                    <Copy className="w-3 h-3" />
                                    Copy All
                                </button>
                                <button
                                    onClick={() => setShowLogModal(false)}
                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-6 font-mono text-xs bg-[#0a0e1a]">
                            {scanData?.logs ? (
                                <div className="space-y-1">
                                    {scanData.logs.split('\n').map((line: string, idx: number) => {
                                        let lineClass = "text-slate-300";
                                        let icon = null;

                                        // Color coding based on log content
                                        if (line.includes('[Scanner]') || line.includes('START') || line.includes('END')) {
                                            lineClass = "text-cyan-400 font-semibold";
                                        } else if (line.includes('✓') || line.includes('completed') || line.includes('success')) {
                                            lineClass = "text-emerald-400";
                                            icon = <CheckCircle2 className="w-3 h-3 inline mr-1" />;
                                        } else if (line.includes('⚠') || line.includes('WARNING') || line.includes('skipped')) {
                                            lineClass = "text-amber-400 font-medium";
                                            icon = <AlertTriangle className="w-3 h-3 inline mr-1" />;
                                        } else if (line.includes('Error') || line.includes('ERROR') || line.includes('Failed')) {
                                            lineClass = "text-red-400 font-medium";
                                            icon = <AlertCircle className="w-3 h-3 inline mr-1" />;
                                        } else if (line.includes('Opengrep') || line.includes('Trivy')) {
                                            lineClass = "text-purple-300";
                                        } else if (line.match(/^\s*-/)) {
                                            lineClass = "text-blue-300 pl-4";
                                        }

                                        return (
                                            <div key={idx} className={`${lineClass} hover:bg-white/5 px-2 py-0.5 rounded transition-colors`}>
                                                <span className="text-slate-600 select-none mr-3 inline-block w-10 text-right">{idx + 1}</span>
                                                {icon}
                                                {line}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                                    <Terminal className="w-16 h-16 text-slate-600 mb-4" />
                                    <p className="text-slate-400">Thông tin log không khả dụng</p>
                                    <p className="text-xs text-slate-500 mt-2">Bản quét cũ có thể không hỗ trợ logging chi tiết.</p>
                                    <p className="text-xs text-slate-500">Hãy thử chạy lại bản quét mới để xem log đầy đủ.</p>
                                </div>
                            )}
                        </div>
                        <div className="p-3 border-t border-white/10 bg-white/5 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-4 text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                                    Success
                                </span>
                                <span className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                                    Warning
                                </span>
                                <span className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                    Error
                                </span>
                            </div>
                            <span className="text-muted-foreground">
                                {scanData?.logs ? scanData.logs.split('\n').length : 0} lines
                            </span>
                        </div>
                    </motion.div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-3 space-y-8">

                    {/* Scan Tools Breakdown */}
                    <div className="glass-card p-6 border-l-4 border-l-indigo-500">
                        <h4 className="text-base font-bold flex items-center gap-2 mb-4">
                            <Shield className="w-5 h-5 text-indigo-400" />
                            Findings by Scanning Tool
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* OpenGrep SAST */}
                            <div className="bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Code2 className="w-5 h-5 text-purple-400" />
                                        <h5 className="font-bold text-purple-300">OpenGrep (SAST)</h5>
                                    </div>
                                    <span className="text-3xl font-bold text-purple-400">
                                        {scanData.stats.sastCount || 0}
                                    </span>
                                </div>
                                <p className="text-xs text-purple-200/60">
                                    Static Application Security Testing - Source code
                                </p>
                            </div>

                            {/* Trivy SCA */}
                            <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Shield className="w-5 h-5 text-cyan-400" />
                                        <h5 className="font-bold text-cyan-300">Trivy (SCA)</h5>
                                    </div>
                                    <span className="text-3xl font-bold text-cyan-400">
                                        {scanData.stats.trivyCount || 0}
                                    </span>
                                </div>
                                <p className="text-xs text-cyan-200/60">
                                    Software Composition Analysis - Dependencies
                                </p>
                            </div>

                            {/* TruffleHog Secrets */}
                            <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Key className="w-5 h-5 text-orange-400" />
                                        <h5 className="font-bold text-orange-300">TruffleHog (Secrets)</h5>
                                    </div>
                                    <span className="text-3xl font-bold text-orange-400">
                                        {scanData.stats.secretCount || 0}
                                    </span>
                                </div>
                                <p className="text-xs text-orange-200/60">
                                    Secret Scanning - Hardcoded keys & tokens
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Total Findings</span>
                            <span className="text-2xl font-bold text-indigo-400">
                                {(scanData.stats.sastCount || 0) + (scanData.stats.trivyCount || 0) + (scanData.stats.secretCount || 0)}
                            </span>
                        </div>
                    </div>

                    {/* Language and Warnings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="glass-card p-4 border-l-4 border-l-blue-500">
                            <h4 className="text-sm font-bold flex items-center gap-2">
                                <Code2 className="w-4 h-4 text-blue-400" />
                                Detected Languages
                            </h4>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {scanData.languages && scanData.languages.length > 0 ? scanData.languages.map((lang: string) => (
                                    <span key={lang} className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-md border border-blue-500/20">
                                        {lang}
                                    </span>
                                )) : <span className="text-xs text-muted-foreground">{scanData.language || 'Auto-detected'}</span>}
                            </div>
                        </div>

                        {scanData.missingPacks && scanData.missingPacks.length > 0 && (
                            <div className="glass-card p-4 border-l-4 border-l-amber-500 bg-amber-500/5">
                                <h4 className="text-sm font-bold flex items-center gap-2 text-amber-500">
                                    <AlertCircle className="w-4 h-4" />
                                    Missing Rulepacks
                                </h4>
                                <p className="text-[10px] text-amber-200/70 mt-1">
                                    No comprehensive security rulepacks available for:
                                </p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {scanData.missingPacks.map((lang: string) => (
                                        <span key={lang} className="px-2 py-1 bg-amber-500/10 text-amber-500 text-xs rounded-md border border-amber-500/20 font-medium">
                                            {lang} Pack
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Stats Overview */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Object.entries(scanData.stats.findings).map(([severity, count], index) => {
                            const Icon = severityIcons[severity as keyof typeof severityIcons] || Info
                            const colorClass = severityColors[severity as keyof typeof severityColors] || severityColors.info
                            return (
                                <motion.div
                                    key={severity}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={cn("glass-card p-4 md:p-6", colorClass)}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <Icon className="w-5 h-5" />
                                        <span className="text-2xl md:text-3xl font-bold">{count as number}</span>
                                    </div>
                                    <p className="text-sm font-medium capitalize">{severity}</p>
                                </motion.div>
                            )
                        })}
                    </div>

                    {/* Filters */}
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex gap-2">
                            <select
                                value={selectedSeverity}
                                onChange={(e) => setSelectedSeverity(e.target.value)}
                                className="px-4 py-2 bg-slate-900 border border-white/10 rounded-lg outline-none focus:border-indigo-500 transition-colors text-sm"
                            >
                                <option value="all">All Severities</option>
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="px-4 py-2 bg-slate-900 border border-white/10 rounded-lg outline-none focus:border-indigo-500 transition-colors text-sm"
                            >
                                <option value="all">All Categories</option>
                                {Array.from(new Set(scanData.findings.map((f: any) => f.category))).map((cat: any) => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            <select
                                value={groupBy}
                                onChange={(e) => {
                                    setGroupBy(e.target.value as 'none' | 'file' | 'rule')
                                }}
                                className="px-4 py-2 bg-slate-900 border border-white/10 rounded-lg outline-none focus:border-indigo-500 transition-colors text-sm"
                            >
                                <option value="none">Không nhóm</option>
                                <option value="file">Nhóm theo File</option>
                                <option value="rule">Nhóm theo Lỗi</option>
                            </select>
                        </div>
                        <div className="md:ml-auto text-sm text-muted-foreground flex items-center gap-2">
                            Hiển thị <span className="font-bold text-white">{filteredFindings.length}</span> trên <span className="font-bold text-white">{totalFindingsCount}</span> lỗi phát hiện
                        </div>
                    </div>

                    {/* Findings List */}
                    <div className="space-y-6">
                        {groupBy === 'none' ? (
                            <div className="space-y-4">
                                {filteredFindings.map((finding: any, index: number) => renderFinding(finding, index))}
                                {filteredFindings.length === 0 && renderNoFindings()}
                            </div>
                        ) : (
                            <div className="flex flex-col md:flex-row gap-6 min-h-[600px]">
                                {/* Sidebar */}
                                <div className="w-full md:w-80 flex-shrink-0 space-y-2">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2 mb-4">
                                        {groupBy === 'file' ? 'Danh sách File' : 'Danh sách Lỗi'}
                                    </div>
                                    <div className="glass-card p-2 max-h-[70vh] overflow-y-auto custom-scrollbar">
                                        {Object.entries(
                                            filteredFindings.reduce((acc: any, finding: any) => {
                                                const key = groupBy === 'file' ? removeBasePath(finding.file, basePath) : finding.title;
                                                if (!acc[key]) acc[key] = [];
                                                acc[key].push(finding);
                                                return acc;
                                            }, {})
                                        ).sort(([a], [b]) => a.localeCompare(b)).map(([groupName, issues]: [string, any]) => (
                                            <button
                                                key={groupName}
                                                onClick={() => setSelectedGroupName(groupName)}
                                                className={cn(
                                                    "w-full text-left px-3 py-3 rounded-lg transition-all group relative overflow-hidden",
                                                    selectedGroupName === groupName
                                                        ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-100"
                                                        : "hover:bg-white/5 text-slate-400 border border-transparent"
                                                )}
                                            >
                                                <div className="flex items-start gap-3">
                                                    {groupBy === 'file' ? (
                                                        <FileCode className={cn("w-4 h-4 mt-0.5", selectedGroupName === groupName ? "text-indigo-400" : "text-slate-500")} />
                                                    ) : (
                                                        <Shield className={cn("w-4 h-4 mt-0.5", selectedGroupName === groupName ? "text-indigo-400" : "text-slate-500")} />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium truncate leading-tight">{groupName}</p>
                                                        <p className="text-[10px] mt-1 text-slate-500">
                                                            {issues.length} {issues.length === 1 ? 'vấn đề' : 'vấn đề'}
                                                        </p>
                                                    </div>
                                                    {selectedGroupName === groupName && (
                                                        <ChevronRight className="w-4 h-4 text-indigo-400" />
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Main Content */}
                                <div className="flex-1 min-w-0 space-y-4">
                                    {selectedGroupName ? (
                                        <>
                                            <div className="flex items-center gap-3 mb-6 p-4 glass-card border-l-4 border-l-indigo-500">
                                                <div>
                                                    <h2 className="text-lg font-bold text-white mb-0.5 flex items-center gap-2">
                                                        {groupBy === 'file' ? (
                                                            <FileCode className="w-5 h-5 text-indigo-400" />
                                                        ) : (
                                                            <Shield className="w-5 h-5 text-indigo-400" />
                                                        )}
                                                        {selectedGroupName}
                                                    </h2>
                                                    <p className="text-xs text-muted-foreground font-mono">
                                                        {filteredFindings.filter((f: any) => (groupBy === 'file' ? removeBasePath(f.file, basePath) : f.title) === selectedGroupName).length} lỗi được phát hiện
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                {filteredFindings
                                                    .filter((finding: any) => (groupBy === 'file' ? removeBasePath(finding.file, basePath) : finding.title) === selectedGroupName)
                                                    .map((finding: any, index: number) => renderFinding(finding, index))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="glass-card h-full flex flex-col items-center justify-center p-12 text-center opacity-60">
                                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                                                <ChevronDown className="w-8 h-8 text-slate-500" />
                                            </div>
                                            <h3 className="text-xl font-semibold mb-2 text-slate-300">Chọn một {groupBy === 'file' ? 'File' : 'Lỗi'} bên trái</h3>
                                            <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                                                Chọn một mục từ danh sách để xem chi tiết các vấn đề bảo mật được phát hiện.
                                            </p>
                                        </div>
                                    )}
                                    {filteredFindings.length === 0 && renderNoFindings()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar: File Tree */}
                <div className="lg:col-span-1">
                    <div className="glass-card h-[calc(100vh-100px)] sticky top-6 overflow-hidden flex flex-col">
                        <FileTree
                            data={scanData.fileTree || buildFileTreeFromFindings(scanData.findings)}
                            selectedFile={selectedGroupName && groupBy === 'file' ? selectedGroupName : null}
                            onSelectFile={(path) => {
                                setGroupBy('file');
                                setSelectedGroupName(path);
                            }}
                            onOpenLocation={handleOpenFileLocation}
                            onOpenInEditor={(path) => handleOpenInEditor(path, 1, 1)}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}
