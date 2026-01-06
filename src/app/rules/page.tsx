"use client"

import React, { useState, useEffect } from "react"
import { motion } from "framer-motion"
import {
    Database,
    Search,
    ShieldCheck,
    Code2,
    Zap,
    Tag,
    Loader2,
    Globe,
    Server,
    Info,
    RefreshCw
} from "lucide-react"

interface RulePack {
    id: string
    name: string
    category: string
    description: string
    language: string
    scope: string
    type: string
    icon: string
    path: string
    popularity: number
    ruleCount: number
    isAvailable: boolean
}

export default function RulesPage() {
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState('All Rules')
    const [rules, setRules] = useState<RulePack[]>([])
    const [loading, setLoading] = useState(true)

    const categories = ['All Rules', 'Language', 'Framework', 'Security', 'Compliance', 'Dependencies']

    useEffect(() => {
        fetchAvailableRules()
    }, [])

    const fetchAvailableRules = async () => {
        try {
            setLoading(true)
            const response = await fetch('/api/utils/available-rules')
            const data = await response.json()

            if (data.success) {
                setRules(data.rules)
            }
        } catch (error) {
            console.error('Error fetching rules:', error)
        } finally {
            setLoading(false)
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
            case 'Dependencies':
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
            case 'Dependencies':
            case 'Infrastructure':
                return 'bg-green-500/10 text-green-500'
            case 'Security':
                return 'bg-red-500/10 text-red-500'
            case 'Compliance':
                return 'bg-yellow-500/10 text-yellow-500'
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
                        Scanning RuleSets
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Explore the available security rule-sets that power your scans.
                    </p>
                </div>
                <button
                    onClick={fetchAvailableRules}
                    disabled={loading}
                    className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Stats
                </button>
            </div>

            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search rule packs, languages, scope..."
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
                        return (
                            <motion.div
                                key={rule.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className="glass-card p-6 flex flex-col gap-4 group hover:border-primary/30 transition-all"
                            >
                                <div className="flex items-center justify-between">
                                    <div className={`p-2 rounded-lg ${getCategoryColor(rule.category)}`}>
                                        {getCategoryIcon(rule.category)}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="px-2 py-1 rounded bg-slate-800 border border-white/10 text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                                            {rule.type.includes('Online') ? 'Online' : 'Local'}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className="text-2xl">{rule.icon}</span>
                                        <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                                            {rule.name}
                                        </h3>
                                    </div>
                                    <p className="text-sm text-muted-foreground mb-4 h-10 line-clamp-2">
                                        {rule.description}
                                    </p>

                                    <div className="space-y-3 pt-4 border-t border-white/5">
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <Globe className="w-3.5 h-3.5" />
                                                <span>Scope</span>
                                            </div>
                                            <span className="font-medium text-foreground">{rule.scope}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <Server className="w-3.5 h-3.5" />
                                                <span>Source</span>
                                            </div>
                                            <span className="font-medium text-foreground">{rule.type}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <Tag className="w-3.5 h-3.5" />
                                                <span>Rule Count</span>
                                            </div>
                                            <span className="font-medium text-foreground">~{rule.ruleCount} rules</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-auto pt-4 flex items-center gap-2 text-xs text-muted-foreground bg-primary/5 p-3 rounded-lg border border-primary/10">
                                    <Info className="w-4 h-4 text-primary shrink-0" />
                                    <span>
                                        {rule.id.includes('trivy')
                                            ? 'Requires initial internet connection to fetch local DB.'
                                            : 'Requires internet connection during scan.'}
                                    </span>
                                </div>
                            </motion.div>
                        )
                    })}
                </div>
            )}

            {!loading && filteredRules.length === 0 && (
                <div className="text-center py-20">
                    <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="text-xl font-semibold mb-2">No rule sets found</h3>
                    <p className="text-muted-foreground">
                        Try adjusting your search or category filter
                    </p>
                </div>
            )}
        </div>
    )
}
