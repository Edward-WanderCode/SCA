"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    ShieldCheck,
    Search,
    AlertTriangle,
    Shield,
    Bug,
    Info,
    FileCode,
    Calendar,
    ChevronDown,
    ChevronRight,
    Copy,
    ExternalLink,
    Loader2,
    CheckCircle2,
    Code2,
    Database,
    BarChart3,
    Layers
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Vulnerability {
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
    scanId: string
    scanName: string
    timestamp: string
}

export default function VulnerabilitiesPage() {
    const [loading, setLoading] = useState(true)
    const [vulnerabilities, setVulnerabilities] = useState<Vulnerability[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedSeverity, setSelectedSeverity] = useState<string>('all')
    const [selectedCategory, setSelectedCategory] = useState<string>('all')
    const [groupBy, setGroupBy] = useState<'none' | 'severity' | 'category' | 'cwe'>('severity')
    const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null)
    const [expandedVuln, setExpandedVuln] = useState<string | null>(null)
    const [sortBy, setSortBy] = useState<'severity' | 'date' | 'file'>('severity')

    useEffect(() => {
        fetchAllVulnerabilities()
    }, [])

    useEffect(() => {
        setSelectedGroupName(null)
    }, [groupBy])

    const fetchAllVulnerabilities = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/history')
            const data = await response.json()

            if (data.success && data.history) {
                // Aggregate all vulnerabilities from all scans
                const allVulns: Vulnerability[] = []

                data.history.forEach((scan: { id: string; source?: { name: string }; timestamp: string; findings?: Omit<Vulnerability, 'scanId' | 'scanName' | 'timestamp'>[] }) => {
                    if (scan.findings && Array.isArray(scan.findings)) {
                        scan.findings.forEach((finding) => {
                            allVulns.push({
                                ...finding,
                                scanId: scan.id,
                                scanName: scan.source?.name || 'Unknown',
                                timestamp: scan.timestamp
                            })
                        })
                    }
                })

                setVulnerabilities(allVulns)
            }
        } catch (error) {
            console.error('Failed to fetch vulnerabilities:', error)
        } finally {
            setLoading(false)
        }
    }

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

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 }

    // Filter vulnerabilities
    const filteredVulns = vulnerabilities.filter(vuln => {
        const matchesSearch =
            vuln.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            vuln.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
            vuln.file.toLowerCase().includes(searchQuery.toLowerCase()) ||
            vuln.category.toLowerCase().includes(searchQuery.toLowerCase())

        const matchesSeverity = selectedSeverity === 'all' || vuln.severity === selectedSeverity
        const matchesCategory = selectedCategory === 'all' || vuln.category === selectedCategory

        return matchesSearch && matchesSeverity && matchesCategory
    })

    // Sort vulnerabilities
    const sortedVulns = [...filteredVulns].sort((a, b) => {
        if (sortBy === 'severity') {
            return severityOrder[a.severity] - severityOrder[b.severity]
        } else if (sortBy === 'date') {
            return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        } else {
            return a.file.localeCompare(b.file)
        }
    })

    // Calculate statistics
    const stats = {
        total: vulnerabilities.length,
        critical: vulnerabilities.filter(v => v.severity === 'critical').length,
        high: vulnerabilities.filter(v => v.severity === 'high').length,
        medium: vulnerabilities.filter(v => v.severity === 'medium').length,
        low: vulnerabilities.filter(v => v.severity === 'low').length,
        info: vulnerabilities.filter(v => v.severity === 'info').length,
        uniqueFiles: new Set(vulnerabilities.map(v => v.file)).size,
        uniqueCategories: new Set(vulnerabilities.map(v => v.category)).size,
        uniqueCWEs: new Set(vulnerabilities.filter(v => v.cwe).map(v => v.cwe)).size
    }

    const categories = Array.from(new Set(vulnerabilities.map(v => v.category))).sort()

    const renderVulnerability = (vuln: Vulnerability, index: number) => {
        const sevKey = vuln.severity as keyof typeof severityIcons
        const Icon = severityIcons[sevKey] || Info
        const isExpanded = expandedVuln === vuln.id

        return (
            <motion.div
                key={vuln.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.5) }}
                className={cn(
                    "glass-card overflow-hidden border-l-4",
                    severityColors[sevKey] || 'border-gray-500/20'
                )}
            >
                <div
                    className="p-4 md:p-6 cursor-pointer hover:bg-white/5 transition-colors"
                    onClick={() => setExpandedVuln(isExpanded ? null : vuln.id)}
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                <Icon className="w-5 h-5 flex-shrink-0" />
                                <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                    severityColors[sevKey] || severityColors.info
                                )}>
                                    {vuln.severity}
                                </span>
                                <span className="text-xs text-muted-foreground truncate">{vuln.category}</span>
                                {vuln.cwe && (
                                    <span className="text-xs text-indigo-400 font-mono">{vuln.cwe}</span>
                                )}
                            </div>
                            <h3 className="text-base md:text-lg font-bold mb-1 line-clamp-1">{vuln.title}</h3>
                            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{vuln.message}</p>
                            <div className="flex flex-wrap items-center gap-4 text-xs">
                                <span className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded border border-white/5 font-mono">
                                    <FileCode className="w-3 h-3" />
                                    <span className="truncate max-w-[200px] md:max-w-md">
                                        {vuln.file}:{vuln.line}
                                    </span>
                                </span>
                                <Link
                                    href={`/results/${vuln.scanId}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                                >
                                    <Database className="w-3 h-3" />
                                    {vuln.scanName}
                                </Link>
                                <span className="text-muted-foreground flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(vuln.timestamp).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                        <button className="p-2 flex-shrink-0">
                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                        </button>
                    </div>
                </div>

                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="border-t border-white/10"
                    >
                        <div className="p-4 md:p-6 space-y-6">
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="text-sm font-semibold">Vulnerable Code</h4>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            if (navigator.clipboard && navigator.clipboard.writeText) {
                                                navigator.clipboard.writeText(vuln.code)
                                                    .catch(err => console.error('Failed to copy code:', err));
                                            } else {
                                                alert('Clipboard API not available');
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
                                        <code>{vuln.code}</code>
                                    </pre>
                                </div>
                            </div>

                            {vuln.fix && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-semibold text-emerald-500">Suggested Fix</h4>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                if (navigator.clipboard && navigator.clipboard.writeText) {
                                                    navigator.clipboard.writeText(vuln.fix!)
                                                        .catch(err => console.error('Failed to copy fix:', err));
                                                } else {
                                                    alert('Clipboard API not available');
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
                                            <code>{vuln.fix}</code>
                                        </pre>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3 pt-4 border-t border-white/10">
                                <Link
                                    href={`/results/${vuln.scanId}`}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors"
                                >
                                    <ExternalLink className="w-4 h-4" />
                                    View Full Scan
                                </Link>
                                <button className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-medium rounded-lg text-sm transition-colors">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Mark as Fixed
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </motion.div>
        )
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <p className="text-muted-foreground animate-pulse">Loading vulnerabilities...</p>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                        Vulnerability Database
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Comprehensive view of all security vulnerabilities across all scans
                    </p>
                </div>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card p-6 border-l-4 border-l-indigo-500"
                >
                    <div className="flex items-center justify-between mb-2">
                        <Database className="w-5 h-5 text-indigo-500" />
                        <span className="text-3xl font-bold">{stats.total}</span>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Total Issues</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                    className={cn("glass-card p-6 border-l-4", severityColors.critical)}
                >
                    <div className="flex items-center justify-between mb-2">
                        <AlertTriangle className="w-5 h-5" />
                        <span className="text-3xl font-bold">{stats.critical}</span>
                    </div>
                    <p className="text-sm font-medium">Critical</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className={cn("glass-card p-6 border-l-4", severityColors.high)}
                >
                    <div className="flex items-center justify-between mb-2">
                        <Shield className="w-5 h-5" />
                        <span className="text-3xl font-bold">{stats.high}</span>
                    </div>
                    <p className="text-sm font-medium">High</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className={cn("glass-card p-6 border-l-4", severityColors.medium)}
                >
                    <div className="flex items-center justify-between mb-2">
                        <Bug className="w-5 h-5" />
                        <span className="text-3xl font-bold">{stats.medium}</span>
                    </div>
                    <p className="text-sm font-medium">Medium</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass-card p-6 border-l-4 border-l-green-500"
                >
                    <div className="flex items-center justify-between mb-2">
                        <FileCode className="w-5 h-5 text-green-500" />
                        <span className="text-3xl font-bold">{stats.uniqueFiles}</span>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Affected Files</p>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="glass-card p-6 border-l-4 border-l-purple-500"
                >
                    <div className="flex items-center justify-between mb-2">
                        <Layers className="w-5 h-5 text-purple-500" />
                        <span className="text-3xl font-bold">{stats.uniqueCategories}</span>
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">Categories</p>
                </motion.div>
            </div>

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search vulnerabilities by title, file, category..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-card border border-white/5 rounded-lg pl-10 pr-4 py-3 outline-none focus:border-primary/50 transition-all"
                    />
                </div>
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
                        <option value="info">Info</option>
                    </select>
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-4 py-2 bg-slate-900 border border-white/10 rounded-lg outline-none focus:border-indigo-500 transition-colors text-sm"
                    >
                        <option value="all">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Group By and Sort Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex gap-2">
                    <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
                        className="px-4 py-2 bg-slate-900 border border-white/10 rounded-lg outline-none focus:border-indigo-500 transition-colors text-sm"
                    >
                        <option value="none">No Grouping</option>
                        <option value="severity">Group by Severity</option>
                        <option value="category">Group by Category</option>
                        <option value="cwe">Group by CWE</option>
                    </select>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                        className="px-4 py-2 bg-slate-900 border border-white/10 rounded-lg outline-none focus:border-indigo-500 transition-colors text-sm"
                    >
                        <option value="severity">Sort by Severity</option>
                        <option value="date">Sort by Date</option>
                        <option value="file">Sort by File</option>
                    </select>
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                    Showing <span className="font-bold text-white">{sortedVulns.length}</span> of <span className="font-bold text-white">{stats.total}</span> vulnerabilities
                </div>
            </div>

            {/* Vulnerabilities List */}
            {groupBy === 'none' ? (
                <div className="space-y-4">
                    {sortedVulns.map((vuln, index) => renderVulnerability(vuln, index))}
                    {sortedVulns.length === 0 && (
                        <div className="glass-card p-12 text-center">
                            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold mb-2">No vulnerabilities found</h3>
                            <p className="text-muted-foreground">
                                {searchQuery || selectedSeverity !== 'all' || selectedCategory !== 'all'
                                    ? 'Try adjusting your filters'
                                    : 'Great! No security issues detected'}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex flex-col md:flex-row gap-6 min-h-[600px]">
                    {/* Sidebar */}
                    <div className="w-full md:w-80 flex-shrink-0 space-y-2">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2 mb-4">
                            {groupBy === 'severity' ? 'Severity Levels' : groupBy === 'category' ? 'Categories' : 'CWE IDs'}
                        </div>
                        <div className="glass-card p-2 max-h-[70vh] overflow-y-auto">
                            {Object.entries(
                                sortedVulns.reduce((acc: Record<string, Vulnerability[]>, vuln) => {
                                    const key = groupBy === 'severity' ? vuln.severity :
                                        groupBy === 'category' ? vuln.category :
                                            vuln.cwe || 'No CWE'
                                    if (!acc[key]) acc[key] = []
                                    acc[key].push(vuln)
                                    return acc
                                }, {})
                            ).sort(([a], [b]) => {
                                if (groupBy === 'severity') {
                                    return severityOrder[a as keyof typeof severityOrder] - severityOrder[b as keyof typeof severityOrder]
                                }
                                return a.localeCompare(b)
                            }).map(([groupName, vulns]: [string, Vulnerability[]]) => (
                                <button
                                    key={groupName}
                                    onClick={() => setSelectedGroupName(groupName)}
                                    className={cn(
                                        "w-full text-left px-3 py-3 rounded-lg transition-all group relative overflow-hidden mb-1",
                                        selectedGroupName === groupName
                                            ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-100"
                                            : "hover:bg-white/5 text-slate-400 border border-transparent"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        {groupBy === 'severity' && (
                                            (() => {
                                                const Icon = severityIcons[groupName as keyof typeof severityIcons]
                                                return <Icon className={cn("w-4 h-4 mt-0.5", selectedGroupName === groupName ? "text-indigo-400" : "text-slate-500")} />
                                            })()
                                        )}
                                        {groupBy === 'category' && <BarChart3 className={cn("w-4 h-4 mt-0.5", selectedGroupName === groupName ? "text-indigo-400" : "text-slate-500")} />}
                                        {groupBy === 'cwe' && <Code2 className={cn("w-4 h-4 mt-0.5", selectedGroupName === groupName ? "text-indigo-400" : "text-slate-500")} />}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate leading-tight capitalize">{groupName}</p>
                                            <p className="text-[10px] mt-1 text-slate-500">
                                                {vulns.length} {vulns.length === 1 ? 'issue' : 'issues'}
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
                                        <h2 className="text-lg font-bold text-white mb-0.5 capitalize">
                                            {selectedGroupName}
                                        </h2>
                                        <p className="text-xs text-muted-foreground">
                                            {sortedVulns.filter(v => {
                                                const key = groupBy === 'severity' ? v.severity :
                                                    groupBy === 'category' ? v.category :
                                                        v.cwe || 'No CWE'
                                                return key === selectedGroupName
                                            }).length} vulnerabilities detected
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    {sortedVulns
                                        .filter(v => {
                                            const key = groupBy === 'severity' ? v.severity :
                                                groupBy === 'category' ? v.category :
                                                    v.cwe || 'No CWE'
                                            return key === selectedGroupName
                                        })
                                        .map((vuln, index) => renderVulnerability(vuln, index))}
                                </div>
                            </>
                        ) : (
                            <div className="glass-card h-full flex flex-col items-center justify-center p-12 text-center opacity-60">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                                    <ChevronDown className="w-8 h-8 text-slate-500" />
                                </div>
                                <h3 className="text-xl font-semibold mb-2 text-slate-300">Select a group from the left</h3>
                                <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                                    Choose a {groupBy === 'severity' ? 'severity level' : groupBy === 'category' ? 'category' : 'CWE ID'} to view detailed vulnerabilities.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
