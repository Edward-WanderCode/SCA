"use client"

import React from "react"
import { motion } from "framer-motion"
import {
  ShieldAlert,
  ShieldCheck,
  Info,
  Zap,
  Clock,
  Code2,
  ChevronRight,
  Plus
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { tryFormatDate } from "@/lib/date-utils"

// Removed static data

import { formatDistanceToNow } from 'date-fns'

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [stats, setStats] = React.useState([
    { name: 'Total Scans', value: '0', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'Critical High', value: '0', icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-500/10' },
    { name: 'Medium Risks', value: '0', icon: Info, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    { name: 'Languages', value: '0', icon: Code2, color: 'text-green-500', bg: 'bg-green-500/10' },
  ])
  const [recentScans, setRecentScans] = React.useState<any[]>([])
  const [securityScore, setSecurityScore] = React.useState(100)

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/history')
        const data = await res.json()
        if (data.success && data.history) {
          const history = data.history

          // Calculate stats
          const totalScans = history.length
          const criticalHigh = history.reduce((acc: number, scan: any) =>
            acc + (scan.stats.findings.critical || 0) + (scan.stats.findings.high || 0), 0)
          const mediumRisks = history.reduce((acc: number, scan: any) =>
            acc + (scan.stats.findings.medium || 0), 0)
          const uniqueLanguages = new Set(history.flatMap((s: any) => s.languages || [])).size

          setStats([
            { name: 'Total Scans', value: totalScans.toString(), icon: Zap, color: 'text-blue-500', bg: 'bg-blue-500/10' },
            { name: 'Critical High', value: criticalHigh.toString(), icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-500/10' },
            { name: 'Medium Risks', value: mediumRisks.toString(), icon: Info, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
            { name: 'Languages', value: uniqueLanguages.toString(), icon: Code2, color: 'text-green-500', bg: 'bg-green-500/10' },
          ])

          // Recent scans (top 5)
          setRecentScans(history.slice(0, 5))

          // Simple security score calc (100 - penalties)
          let score = 100
          if (totalScans > 0) {
            const latestScan = history[0]
            const findings = latestScan.stats.findings
            score -= (findings.critical * 10) + (findings.high * 5) + (findings.medium * 1)
            score = Math.max(0, Math.round(score))
          }
          setSecurityScore(score)
        }
      } catch (e) {
        console.error('Failed to fetch dashboard data', e)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
          <p className="text-muted-foreground mt-1">Monitor your code security and compliance status.</p>
        </div>
        <Link href="/scan">
          <button className="flex items-center gap-2 bg-primary px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-all glow-primary">
            <Plus className="w-4 h-4" />
            New Scan
          </button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="glass-card p-6"
          >
            <div className="flex items-center gap-4">
              <div className={`${stat.bg} p-3 rounded-xl`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{stat.name}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Scans */}
        <div className="lg:col-span-2 glass-card">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Scans</h2>
            <Link href="/history" className="text-sm text-primary hover:underline flex items-center gap-1">
              View All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-sm text-muted-foreground bg-white/5">
                  <th className="px-6 py-3 font-medium">Project Name</th>
                  <th className="px-6 py-3 font-medium">Language</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Findings</th>
                  <th className="px-6 py-3 font-medium text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentScans.map((scan) => (
                  <tr
                    key={scan.id}
                    onClick={() => router.push(`/results/${scan.id}`)}
                    className="text-sm hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    <td className="px-6 py-4 font-medium flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center">
                        <Code2 className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
                      </div>
                      {scan.source?.name || 'Unknown Project'}
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">{scan.language || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${scan.status === 'completed' ? 'bg-green-500/10 text-green-500' :
                        scan.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                          'bg-blue-500/10 text-blue-500'
                        }`}>
                        {scan.status || 'Completed'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-semibold ${(scan.stats?.findings?.critical + scan.stats?.findings?.high) > 0 ? 'text-red-400' :
                        (scan.stats?.findings?.medium) > 0 ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                        {Object.values(scan.stats?.findings || {}).reduce((a: any, b: any) => a + b, 0) as number} Findings
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-muted-foreground flex items-center justify-end gap-1">
                      <Clock className="w-3 h-3" /> {tryFormatDate(scan.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Security Health */}
        <div className="glass-card p-6 flex flex-col items-center justify-center text-center gap-6">
          <div className="relative">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle
                cx="64"
                cy="64"
                r="58"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-slate-800"
              />
              <circle
                cx="64"
                cy="64"
                r="58"
                stroke="currentColor"
                strokeWidth="8"
                strokeDasharray={364}
                strokeDashoffset={364 * (1 - 0.85)}
                fill="transparent"
                strokeLinecap="round"
                className="text-primary transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold">{securityScore}%</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Health</span>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-lg">Overall Security Score</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Based on your latest scan results. {securityScore < 80 ? 'Attention needed.' : 'Looking good!'}
            </p>
          </div>
          <button className="w-full py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-colors text-sm font-semibold">
            Run Full Audit
          </button>
        </div>
      </div>
    </div>
  )
}
