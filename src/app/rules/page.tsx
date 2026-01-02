"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    Database,
    Search,
    Filter,
    ShieldCheck,
    Download,
    CheckCircle2,
    Code2,
    Zap,
    Tag,
    Loader2,
    RefreshCw
} from "lucide-react"

interface RulePack {
    id: string
    name: string
    category: string
    description: string
    language: string
    icon: string
    path: string
    popularity: number
    ruleCount: number
    isDownloaded: boolean
    downloadedAt: string | null
    localSize: number
    localRuleCount: number
}

export default function RulesPage() {
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('All Rules')
    const [rules, setRules] = useState<RulePack[]>([])
    const [loading, setLoading] = useState(true)
    const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
    const [stats, setStats] = useState({ totalPacks: 0, downloadedCount: 0 })
    const [offlineStatus, setOfflineStatus] = useState<{ isDownloaded: boolean, downloadedAt?: string, ruleCount?: number }>({ isDownloaded: false })
    const [isDownloadingOffline, setIsDownloadingOffline] = useState(false)

    const categories = ['All Rules', 'Language', 'Framework', 'Infrastructure']

    useEffect(() => {
        fetchAvailableRules()
        fetchOfflineStatus()
    }, [])

    const fetchOfflineStatus = async () => {
        try {
            const response = await fetch('/api/opengrep/rules-status')
            const data = await response.json()
            if (data.success) {
                setOfflineStatus(data)
            }
        } catch (error) {
            console.error('Error fetching offline status:', error)
        }
    }

    const handleDownloadOffline = async () => {
        setIsDownloadingOffline(true)
        try {
            const response = await fetch('/api/opengrep/download-rules', { method: 'POST' })
            const data = await response.json()
            if (data.success) {
                alert('RulePack downloaded/updated successfully!')
                fetchOfflineStatus()
            } else {
                alert('Failed to download RulePack: ' + data.error)
            }
        } catch (error) {
            console.error('Error downloading offline rules:', error)
            alert('Error connecting to server')
        } finally {
            setIsDownloadingOffline(false)
        }
    }

    const fetchAvailableRules = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/utils/available-rules')
            const data = await response.json()

            if (data.success) {
                setRules(data.rules)
                setStats({
                    totalPacks: data.totalPacks,
                    downloadedCount: data.downloadedCount
                })
            }
        } catch (error) {
            console.error('Error fetching rules:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleDownloadRule = async (rule: RulePack) => {
        if (downloadingIds.has(rule.id)) return

        setDownloadingIds(prev => new Set(prev).add(rule.id))

        try {
            console.log(`Downloading ${rule.name} (${rule.path})...`)

            const response = await fetch('/api/opengrep/download-rule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rulePackId: rule.id,
                    rulePath: rule.path
                })
            })

            // Check if response is ok before parsing JSON
            if (!response.ok) {
                const text = await response.text()
                console.error('Download failed:', text)
                throw new Error(`HTTP ${response.status}: ${text || 'Download failed'}`)
            }

            // Try to parse JSON, with fallback
            let data
            try {
                const text = await response.text()
                if (!text.trim()) {
                    throw new Error('Empty response from server')
                }
                data = JSON.parse(text)
            } catch (parseError) {
                console.error('JSON parse error:', parseError)
                throw new Error('Invalid response from server')
            }

            if (data.success) {
                console.log(`Successfully downloaded ${rule.name}`)
                // Refresh rules list to update download status
                await fetchAvailableRules()
            } else {
                console.error('Download failed:', data.error)
                alert(`Failed to download ${rule.name}:\n${data.error || 'Unknown error'}`)
            }
        } catch (error: any) {
            console.error('Download error:', error)
            alert(`Error downloading ${rule.name}:\n${error.message || 'Network error'}`)
        } finally {
            setDownloadingIds(prev => {
                const newSet = new Set(prev)
                newSet.delete(rule.id)
                return newSet
            })
        }
    }

    const filteredRules = rules.filter(r => {
        const matchesSearch = r.name.toLowerCase().includes(search.toLowerCase()) ||
            r.language.toLowerCase().includes(search.toLowerCase()) ||
            r.description.toLowerCase().includes(search.toLowerCase())

        const matchesCategory = selectedCategory === 'All Rules' || r.category === selectedCategory

        return matchesSearch && matchesCategory
    })

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'Language':
                return <Code2 className="w-5 h-5" />
            case 'Framework':
                return <Zap className="w-5 h-5" />
            case 'Infrastructure':
                return <ShieldCheck className="w-5 h-5" />
            default:
                return <Database className="w-5 h-5" />
        }
    }

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'Language':
                return 'bg-blue-500/10 text-blue-500'
            case 'Framework':
                return 'bg-purple-500/10 text-purple-500'
            case 'Infrastructure':
                return 'bg-green-500/10 text-green-500'
            default:
                return 'bg-gray-500/10 text-gray-500'
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Database className="w-8 h-8 text-primary" />
                        Opengrep Rule Registry
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        View available rules from the Opengrep & Trivy community
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-2xl font-bold text-primary">
                            {stats.downloadedCount}/{stats.totalPacks}
                        </div>
                        <div className="text-xs text-muted-foreground">Packs Downloaded</div>
                    </div>
                    <button
                        onClick={fetchAvailableRules}
                        disabled={loading}
                        className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Offline Rules Banner */}
            <div className="glass-card p-6 bg-gradient-to-r from-primary/10 to-transparent border-primary/20">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-primary/20 rounded-xl text-primary">
                            <Database className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                Offline RulePack
                                {offlineStatus.isDownloaded && (
                                    <span className="text-xs bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full font-normal">
                                        Ready for Offline
                                    </span>
                                )}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {offlineStatus.isDownloaded
                                    ? `Last updated: ${new Date(offlineStatus.downloadedAt!).toLocaleString()}. ${offlineStatus.ruleCount} rules available locally.`
                                    : "Download the full community RulePack to use Opengrep without internet connection."}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleDownloadOffline}
                        disabled={isDownloadingOffline}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${offlineStatus.isDownloaded
                            ? 'bg-slate-800 hover:bg-slate-700 text-white border border-white/10'
                            : 'bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20'
                            } disabled:opacity-50`}
                    >
                        {isDownloadingOffline ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                {offlineStatus.isDownloaded ? <RefreshCw className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                                {offlineStatus.isDownloaded ? "Update RulePack" : "Download Offline Pack"}
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search rule packs, languages or frameworks..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-card border border-white/5 rounded-lg pl-10 pr-4 py-3 outline-none focus:border-primary/50 transition-all"
                    />
                </div>
            </div>

            {/* Categories */}
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-all ${selectedCategory === cat
                            ? 'bg-primary border-primary'
                            : 'bg-slate-800 border-white/5 hover:border-white/20'
                            }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredRules.map((rule, index) => {
                        const isDownloading = downloadingIds.has(rule.id)

                        return (
                            <motion.div
                                key={rule.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className={`glass-card p-6 flex flex-col gap-4 group transition-all ${rule.isDownloaded ? 'border-green-500/30' : 'hover:border-primary/30'
                                    }`}
                            >
                                <div className="flex items-start justify-between">
                                    <div className={`p-2 rounded-lg ${getCategoryColor(rule.category)}`}>
                                        {getCategoryIcon(rule.category)}
                                    </div>
                                    {rule.isDownloaded && (
                                        <div className="flex items-center gap-1 text-green-500 text-xs font-medium">
                                            <CheckCircle2 className="w-4 h-4" />
                                            Downloaded
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">{rule.icon}</span>
                                        <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                                            {rule.name}
                                        </h3>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-3">
                                        {rule.description}
                                    </p>
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <Code2 className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">{rule.language}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Tag className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground font-medium">
                                                {rule.isDownloaded ? rule.localRuleCount : rule.ruleCount} rules
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 ml-auto">
                                            <div className="flex items-center gap-1">
                                                <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full bg-primary"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: `${rule.popularity}%` }}
                                                        transition={{ delay: index * 0.1, duration: 0.5 }}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-muted-foreground font-medium">
                                                    {rule.popularity}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto pt-4 border-t border-white/5">
                                    {rule.isDownloaded ? (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-muted-foreground">
                                                {rule.localSize.toFixed(2)} KB
                                            </span>
                                            <button
                                                onClick={() => handleDownloadRule(rule)}
                                                disabled={isDownloading}
                                                className="text-primary hover:text-primary/80 text-xs flex items-center gap-1 disabled:opacity-50"
                                            >
                                                {isDownloading ? (
                                                    <>
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        Updating...
                                                    </>
                                                ) : (
                                                    <>
                                                        <RefreshCw className="w-3 h-3" />
                                                        Re-download
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => handleDownloadRule(rule)}
                                            disabled={isDownloading}
                                            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isDownloading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                    Downloading...
                                                </>
                                            ) : (
                                                <>
                                                    <Download className="w-4 h-4" />
                                                    Download Pack
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            {!loading && filteredRules.length === 0 && (
                <div className="text-center py-20">
                    <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-semibold mb-2">No rule packs found</h3>
                    <p className="text-muted-foreground">
                        Try adjusting your search or category filter
                    </p>
                </div>
            )}
        </div>
    )
}
