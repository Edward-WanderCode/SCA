"use client"

import React, { useState } from "react"
import { motion } from "framer-motion"
import {
    History,
    Search,
    Filter,
    Calendar,
    GitBranch,
    FileCode,
    AlertTriangle,
    CheckCircle2,
    Clock,
    TrendingDown,
    TrendingUp,
    Eye,
    Download,
    Trash2,
    MoreVertical,
    RefreshCw
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface ScanHistory {
    id: string
    timestamp: string
    source: {
        type: 'git' | 'upload' | 'folder'
        name: string
        url?: string
        path?: string
    }
    stats: {
        filesScanned: number
        linesScanned?: number | string
        rulesApplied: number
        duration: number
        findings: {
            critical: number
            high: number
            medium: number
            low: number
            info: number
        }
    }
    status: 'completed' | 'failed' | 'running'
    language: string
    findings?: any[]  // Optional findings array for PDF export
}

const mockHistory: ScanHistory[] = [
    {
        id: 'scan-001',
        timestamp: '2025-12-30T09:45:23Z',
        source: {
            type: 'git',
            name: 'frontend-app',
            url: 'https://github.com/user/frontend-app'
        },
        stats: {
            filesScanned: 247,
            rulesApplied: 2451,
            duration: 45,
            findings: {
                critical: 2,
                high: 5,
                medium: 12,
                low: 8,
                info: 3
            }
        },
        status: 'completed',
        language: 'TypeScript'
    },
    {
        id: 'scan-002',
        timestamp: '2025-12-29T14:22:11Z',
        source: {
            type: 'upload',
            name: 'backend-api.zip'
        },
        stats: {
            filesScanned: 189,
            rulesApplied: 3120,
            duration: 62,
            findings: {
                critical: 0,
                high: 3,
                medium: 15,
                low: 22,
                info: 5
            }
        },
        status: 'completed',
        language: 'Python'
    },
    {
        id: 'scan-003',
        timestamp: '2025-12-29T10:15:45Z',
        source: {
            type: 'git',
            name: 'microservices-core',
            url: 'https://github.com/user/microservices-core'
        },
        stats: {
            filesScanned: 512,
            rulesApplied: 4230,
            duration: 128,
            findings: {
                critical: 1,
                high: 8,
                medium: 24,
                low: 31,
                info: 12
            }
        },
        status: 'completed',
        language: 'Go'
    },
    {
        id: 'scan-004',
        timestamp: '2025-12-28T16:30:00Z',
        source: {
            type: 'git',
            name: 'legacy-system',
            url: 'https://github.com/user/legacy-system'
        },
        stats: {
            filesScanned: 423,
            rulesApplied: 2890,
            duration: 0,
            findings: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                info: 0
            }
        },
        status: 'failed',
        language: 'Java'
    },
    {
        id: 'scan-005',
        timestamp: '2025-12-27T08:12:33Z',
        source: {
            type: 'upload',
            name: 'mobile-app-src.zip'
        },
        stats: {
            filesScanned: 156,
            rulesApplied: 1842,
            duration: 38,
            findings: {
                critical: 0,
                high: 1,
                medium: 7,
                low: 14,
                info: 4
            }
        },
        status: 'completed',
        language: 'JavaScript'
    },
]

export default function HistoryPage() {
    const [search, setSearch] = useState('')
    const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'failed'>('all')
    const [history, setHistory] = useState<ScanHistory[]>([])
    const [loading, setLoading] = useState(true)
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

    React.useEffect(() => {
        fetchHistory()

        // Auto-refresh every 5 seconds to show running scans
        const interval = setInterval(() => {
            fetchHistory()
        }, 5000)

        return () => clearInterval(interval)
    }, [])

    const fetchHistory = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/history')
            const data = await response.json()
            if (data.success) {
                setHistory(data.history)
            }
        } catch (error) {
            console.error('Failed to fetch history:', error)
        } finally {
            setLoading(false)
        }
    }

    const filteredHistory = history.filter(scan => {
        const matchesSearch = scan.source.name.toLowerCase().includes(search.toLowerCase()) ||
            scan.language.toLowerCase().includes(search.toLowerCase())
        const matchesStatus = filterStatus === 'all' || scan.status === filterStatus
        return matchesSearch && matchesStatus
    })

    const handleDeleteScan = async (scanId: string) => {
        try {
            const response = await fetch(`/api/history?id=${scanId}`, {
                method: 'DELETE'
            })
            const data = await response.json()
            if (data.success) {
                setHistory(prev => prev.filter(scan => scan.id !== scanId))
            } else {
                alert('Failed to delete scan: ' + data.error)
            }
        } catch (error) {
            console.error('Delete error:', error)
            alert('Error deleting scan')
        } finally {
            setDeleteConfirm(null)
        }
    }

    const getTotalFindings = (findings: ScanHistory['stats']['findings']) => {
        return findings.critical + findings.high + findings.medium + findings.low + findings.info
    }

    const getStatusColor = (status: ScanHistory['status']) => {
        switch (status) {
            case 'completed':
                return 'text-green-500 bg-green-500/10'
            case 'failed':
                return 'text-red-500 bg-red-500/10'
            case 'running':
                return 'text-blue-500 bg-blue-500/10'
        }
    }

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMins / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffMins < 60) return `${diffMins}m ago`
        if (diffHours < 24) return `${diffHours}h ago`
        if (diffDays === 1) return 'Yesterday'
        if (diffDays < 7) return `${diffDays}d ago`
        return date.toLocaleDateString()
    }

    const totalScans = history.length
    const completedScans = history.filter(s => s.status === 'completed').length
    const failedScans = history.filter(s => s.status === 'failed').length
    const avgDuration = completedScans > 0 ? Math.round(
        history.filter(s => s.status === 'completed')
            .reduce((acc, s) => acc + s.stats.duration, 0) / completedScans
    ) : 0

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <History className="w-8 h-8 text-primary" />
                        Scan History
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        View and manage all previous code analysis scans
                    </p>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Total Scans</p>
                            <p className="text-3xl font-bold mt-1">{totalScans}</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <History className="w-6 h-6 text-primary" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="glass-card p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Completed</p>
                            <p className="text-3xl font-bold mt-1 text-green-500">{completedScans}</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                            <CheckCircle2 className="w-6 h-6 text-green-500" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass-card p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Failed</p>
                            <p className="text-3xl font-bold mt-1 text-red-500">{failedScans}</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                            <AlertTriangle className="w-6 h-6 text-red-500" />
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="glass-card p-6"
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted-foreground">Avg Duration</p>
                            <p className="text-3xl font-bold mt-1">{avgDuration}s</p>
                        </div>
                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <Clock className="w-6 h-6 text-blue-500" />
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Search and Filters */}
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by project name or language..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-card border border-white/5 rounded-lg pl-10 pr-4 py-3 outline-none focus:border-primary/50 transition-all"
                    />
                </div>
                <div className="flex gap-2">
                    {(['all', 'completed', 'failed'] as const).map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={cn(
                                "px-4 py-2 rounded-lg border transition-all capitalize",
                                filterStatus === status
                                    ? "bg-primary border-primary"
                                    : "bg-slate-800 border-white/10 hover:border-white/20"
                            )}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            </div>

            {/* History List */}
            <div className="space-y-4">
                {filteredHistory.map((scan, index) => {
                    const totalFindings = getTotalFindings(scan.stats.findings)
                    const criticalCount = scan.stats.findings.critical + scan.stats.findings.high

                    return (
                        <motion.div
                            key={scan.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className="glass-card p-6 hover:border-primary/30 transition-all cursor-pointer group"
                        >
                            <div className="flex items-start justify-between gap-4">
                                {/* Left Section */}
                                <div className="flex-1 space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            "w-10 h-10 rounded-lg flex items-center justify-center",
                                            scan.source.type === 'git' ? 'bg-purple-500/10' : 'bg-blue-500/10'
                                        )}>
                                            {scan.source.type === 'git' ? (
                                                <GitBranch className="w-5 h-5 text-purple-500" />
                                            ) : (
                                                <FileCode className="w-5 h-5 text-blue-500" />
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                                                {scan.source.name}
                                            </h3>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {formatTimestamp(scan.timestamp)}
                                                </span>
                                                <span className="text-xs text-muted-foreground">•</span>
                                                <span className="text-xs text-muted-foreground">{scan.language}</span>
                                                <span className={cn(
                                                    "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                                                    getStatusColor(scan.status)
                                                )}>
                                                    {scan.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {scan.source.url && (
                                        <p className="text-xs text-muted-foreground font-mono bg-black/30 px-2 py-1 rounded inline-block">
                                            {scan.source.url}
                                        </p>
                                    )}
                                </div>

                                {/* Stats Section */}
                                {scan.status === 'completed' && (
                                    <div className="flex items-center gap-6">
                                        <div className="text-center">
                                            <p className="text-2xl font-bold">{totalFindings}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Findings</p>
                                        </div>
                                        <div className="text-center">
                                            <p className={cn(
                                                "text-2xl font-bold",
                                                criticalCount > 0 ? "text-red-500" : "text-green-500"
                                            )}>
                                                {criticalCount}
                                            </p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Critical/High</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-2xl font-bold">{scan.stats.filesScanned}</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Files</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-2xl font-bold">{scan.stats.duration}s</p>
                                            <p className="text-[10px] text-muted-foreground uppercase">Duration</p>
                                        </div>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const confirmRescan = confirm(`Do you want to re-analyze ${scan.source.name}?`);
                                            if (!confirmRescan) return;

                                            // Redirect to scan page with pre-filled parameters
                                            const query = new URLSearchParams({
                                                method: scan.source.type,
                                                path: scan.source.path || scan.source.url || '',
                                                compareWithId: scan.id
                                            }).toString();

                                            window.location.href = `/scan?${query}`;
                                        }}
                                        className="p-2 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors border border-indigo-500/20 flex items-center justify-center shrink-0"
                                        title="Rescan and compare"
                                    >
                                        <RefreshCw className="w-4 h-4" />
                                    </button>
                                    <Link
                                        href={`/results/${scan.id}`}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
                                    >
                                        <Eye className="w-4 h-4" />
                                        View
                                    </Link>
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            const { exportScanToPDF } = await import('@/lib/pdf-export');
                                            exportScanToPDF(scan as any);
                                        }}
                                        className="p-2 hover:bg-white/5 rounded-lg transition-colors"
                                        title="Export PDF Report"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteConfirm(scan.id);
                                        }}
                                        className="p-2 hover:bg-red-500/10 rounded-lg transition-colors group"
                                        title="Delete scan"
                                    >
                                        <Trash2 className="w-4 h-4 group-hover:text-red-500" />
                                    </button>
                                </div>
                            </div>

                            {/* Comparison Stats */}
                            {(scan.stats as any).comparison && (
                                <div className="mt-4 flex items-center gap-6 py-2 px-4 bg-white/5 rounded-lg border border-white/5 text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground uppercase font-bold tracking-wider">Comparison:</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-emerald-400 font-bold">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>{(scan.stats as any).comparison.fixed} Fixed</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-red-400 font-bold">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span>{(scan.stats as any).comparison.new} New</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-400">
                                        <TrendingDown className="w-3 h-3" />
                                        <span>{(scan.stats as any).comparison.existing} Persistent</span>
                                    </div>
                                </div>
                            )}


                            {/* Findings Breakdown */}
                            {scan.status === 'completed' && (
                                <div className="mt-4 pt-4 border-t border-white/5">
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs text-muted-foreground uppercase font-semibold">Severity Breakdown:</span>
                                        <div className="flex gap-3 flex-1">
                                            {scan.stats.findings.critical > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                    <span className="text-xs">Critical: {scan.stats.findings.critical}</span>
                                                </div>
                                            )}
                                            {scan.stats.findings.high > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                                    <span className="text-xs">High: {scan.stats.findings.high}</span>
                                                </div>
                                            )}
                                            {scan.stats.findings.medium > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                                                    <span className="text-xs">Medium: {scan.stats.findings.medium}</span>
                                                </div>
                                            )}
                                            {scan.stats.findings.low > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                    <span className="text-xs">Low: {scan.stats.findings.low}</span>
                                                </div>
                                            )}
                                            {scan.stats.findings.info > 0 && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-2 h-2 rounded-full bg-gray-500"></div>
                                                    <span className="text-xs">Info: {scan.stats.findings.info}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )
                })}
            </div>

            {filteredHistory.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <History className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-semibold mb-2">No scan history found</h3>
                    <p className="text-muted-foreground mb-6">
                        {search ? 'Try adjusting your search terms' : 'Start your first scan to see results here'}
                    </p>
                    <Link
                        href="/scan"
                        className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 px-6 py-3 rounded-lg font-semibold transition-colors"
                    >
                        Start New Scan
                    </Link>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="glass-card p-6 max-w-md mx-4"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                                <AlertTriangle className="w-6 h-6 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">Delete Scan?</h3>
                                <p className="text-sm text-muted-foreground">This action cannot be undone</p>
                            </div>
                        </div>

                        <p className="text-sm text-muted-foreground mb-6">
                            Are you sure you want to delete this scan and all its findings?
                            This will permanently remove all data associated with this scan.
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteScan(deleteConfirm)}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    )
}
