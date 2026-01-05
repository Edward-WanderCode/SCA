"use client"

import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    ChevronRight,
    ChevronDown,
    Folder,
    FolderOpen,
    GitBranch,
    FileCode,
    TrendingUp,
    TrendingDown,
    Minus,
    Calendar,
    Eye,
    Download,
    Trash2,
    RefreshCw,
    AlertTriangle,
    CheckCircle2,
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
    findings?: any[]
}

interface ProjectGroup {
    projectKey: string
    projectName: string
    projectType: string
    projectPath?: string
    projectUrl?: string
    scans: ScanHistory[]
    totalScans: number
    latestScan: ScanHistory
    trend: {
        direction: 'up' | 'down' | 'stable'
        difference: number
        percentChange: number
        latestTotal: number
        previousTotal: number
    } | null
}

interface TreeViewProps {
    treeData: ProjectGroup[]
    onDeleteScan: (scanId: string) => void
    setDeleteConfirm: (scanId: string | null) => void
}

export function ScanTreeView({ treeData, onDeleteScan, setDeleteConfirm }: TreeViewProps) {
    const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

    const toggleProject = (projectKey: string) => {
        const newExpanded = new Set(expandedProjects)
        if (newExpanded.has(projectKey)) {
            newExpanded.delete(projectKey)
        } else {
            newExpanded.add(projectKey)
        }
        setExpandedProjects(newExpanded)
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

    return (
        <div className="space-y-3">
            {treeData.map((project, index) => {
                const isExpanded = expandedProjects.has(project.projectKey)
                const latestFindings = getTotalFindings(project.latestScan.stats.findings)
                const criticalCount = project.latestScan.stats.findings.critical + project.latestScan.stats.findings.high

                return (
                    <motion.div
                        key={project.projectKey}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="glass-card overflow-hidden"
                    >
                        {/* Project Header */}
                        <div
                            className="p-4 cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => toggleProject(project.projectKey)}
                        >
                            <div className="flex items-center justify-between gap-4">
                                {/* Left Section */}
                                <div className="flex items-center gap-3 flex-1">
                                    <button className="p-1 hover:bg-white/10 rounded transition-colors">
                                        {isExpanded ? (
                                            <ChevronDown className="w-5 h-5 text-primary" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                        )}
                                    </button>

                                    <div className={cn(
                                        "w-10 h-10 rounded-lg flex items-center justify-center",
                                        isExpanded ? "bg-primary/20" : "bg-primary/10"
                                    )}>
                                        {isExpanded ? (
                                            <FolderOpen className="w-5 h-5 text-primary" />
                                        ) : (
                                            <Folder className="w-5 h-5 text-primary" />
                                        )}
                                    </div>

                                    <div className="flex-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-lg">{project.projectName}</h3>
                                            <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-muted-foreground">
                                                {project.totalScans} scan{project.totalScans > 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 font-mono">
                                            {project.projectPath || project.projectUrl || 'Local folder'}
                                        </p>
                                    </div>
                                </div>

                                {/* Stats Section */}
                                <div className="flex items-center gap-6">
                                    <div className="text-center">
                                        <p className="text-2xl font-bold">{latestFindings}</p>
                                        <p className="text-[10px] text-muted-foreground uppercase">Latest</p>
                                    </div>

                                    {project.trend && (
                                        <div className="text-center">
                                            <div className="flex items-center gap-1 justify-center">
                                                {project.trend.direction === 'up' && (
                                                    <>
                                                        <TrendingUp className="w-4 h-4 text-red-500" />
                                                        <p className="text-xl font-bold text-red-500">
                                                            +{project.trend.difference}
                                                        </p>
                                                    </>
                                                )}
                                                {project.trend.direction === 'down' && (
                                                    <>
                                                        <TrendingDown className="w-4 h-4 text-green-500" />
                                                        <p className="text-xl font-bold text-green-500">
                                                            -{project.trend.difference}
                                                        </p>
                                                    </>
                                                )}
                                                {project.trend.direction === 'stable' && (
                                                    <>
                                                        <Minus className="w-4 h-4 text-gray-500" />
                                                        <p className="text-xl font-bold text-gray-500">0</p>
                                                    </>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground uppercase">
                                                {project.trend.direction === 'up' ? 'Increased' :
                                                    project.trend.direction === 'down' ? 'Decreased' : 'Stable'}
                                            </p>
                                        </div>
                                    )}

                                    <div className="text-center">
                                        <p className={cn(
                                            "text-2xl font-bold",
                                            criticalCount > 0 ? "text-red-500" : "text-green-500"
                                        )}>
                                            {criticalCount}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground uppercase">Critical/High</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Expanded Scans List */}
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="border-t border-white/5"
                                >
                                    <div className="p-4 space-y-3 bg-black/20">
                                        {project.scans.map((scan, scanIndex) => {
                                            const totalFindings = getTotalFindings(scan.stats.findings)
                                            const scanCriticalCount = scan.stats.findings.critical + scan.stats.findings.high

                                            return (
                                                <motion.div
                                                    key={scan.id}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    transition={{ delay: scanIndex * 0.05 }}
                                                    className="bg-card/50 border border-white/5 rounded-lg p-4 hover:border-primary/30 transition-all"
                                                >
                                                    <div className="flex items-center justify-between gap-4">
                                                        {/* Scan Info */}
                                                        <div className="flex items-center gap-3 flex-1">
                                                            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                                                                <Calendar className="w-4 h-4 text-indigo-400" />
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-medium">
                                                                        {formatTimestamp(scan.timestamp)}
                                                                    </span>
                                                                    <span className={cn(
                                                                        "text-xs px-2 py-0.5 rounded-full font-medium capitalize",
                                                                        getStatusColor(scan.status)
                                                                    )}>
                                                                        {scan.status}
                                                                    </span>
                                                                    {scanIndex === 0 && (
                                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                                                                            Latest
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                                    Duration: {scan.stats.duration}s • Files: {scan.stats.filesScanned}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Scan Stats */}
                                                        {scan.status === 'completed' && (
                                                            <div className="flex items-center gap-4">
                                                                <div className="text-center">
                                                                    <p className="text-lg font-bold">{totalFindings}</p>
                                                                    <p className="text-[9px] text-muted-foreground uppercase">Total</p>
                                                                </div>
                                                                <div className="text-center">
                                                                    <p className={cn(
                                                                        "text-lg font-bold",
                                                                        scanCriticalCount > 0 ? "text-red-500" : "text-green-500"
                                                                    )}>
                                                                        {scanCriticalCount}
                                                                    </p>
                                                                    <p className="text-[9px] text-muted-foreground uppercase">Crit/High</p>
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

                                                                    const query = new URLSearchParams({
                                                                        method: scan.source.type,
                                                                        path: scan.source.path || scan.source.url || '',
                                                                        compareWithId: scan.id
                                                                    }).toString();

                                                                    window.location.href = `/scan?${query}`;
                                                                }}
                                                                className="p-2 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors border border-indigo-500/20"
                                                                title="Rescan and compare"
                                                            >
                                                                <RefreshCw className="w-4 h-4" />
                                                            </button>
                                                            <Link
                                                                href={`/results/${scan.id}`}
                                                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg flex items-center gap-2 transition-colors"
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

                                                    {/* Severity Breakdown */}
                                                    {scan.status === 'completed' && (
                                                        <div className="mt-3 pt-3 border-t border-white/5">
                                                            <div className="flex items-center gap-3 flex-wrap">
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
                                                    )}
                                                </motion.div>
                                            )
                                        })}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )
            })}
        </div>
    )
}
