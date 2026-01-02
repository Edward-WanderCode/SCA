"use client"

import React, { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { Terminal as TerminalIcon, Cpu, Zap, Search } from "lucide-react"

const logs = [
    "[SYSTEM] Antigravity SCA Agent v1.5.0 initialized",
    "[SYSTEM] Connecting to Opengrep & Trivy registry...",
    "[REGISTRY] Fetched 18,450 updated rules (Opengrep / OWASP / Trivy)",
    "[INFO] Multi-language analyzer core ready",
    "[INFO] Monitoring for new scan triggers...",
]

export default function TerminalPage() {
    const [currentLogs, setCurrentLogs] = useState<string[]>([])
    const bottomRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const eventSource = new EventSource('/api/terminal/stream');

        eventSource.onmessage = (event) => {
            try {
                const log = JSON.parse(event.data);
                const formattedLog = `[${log.level}] ${log.message} (${new Date(log.timestamp).toLocaleTimeString()})`;
                setCurrentLogs(prev => [...prev, formattedLog].slice(-50));
            } catch (e) {
                console.error('Failed to parse log:', e);
            }
        };

        eventSource.onerror = (err) => {
            console.error('EventSource failed:', err);
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [currentLogs])

    return (
        <div className="h-full flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <TerminalIcon className="w-8 h-8 text-primary" />
                        Agent Terminal
                    </h1>
                    <p className="text-muted-foreground mt-1">Real-time system logs and agentic operations.</p>
                </div>
                <div className="flex gap-4">
                    <div className="glass-card px-4 py-2 flex items-center gap-3">
                        <Cpu className="w-4 h-4 text-primary" />
                        <div className="text-xs">
                            <span className="text-muted-foreground">Backend Status:</span>
                            <span className="ml-2 font-bold text-green-500 uppercase">Operational</span>
                        </div>
                    </div>
                    <div className="glass-card px-4 py-2 flex items-center gap-3">
                        <Zap className="w-4 h-4 text-blue-400" />
                        <div className="text-xs">
                            <span className="text-muted-foreground">Scans Today:</span>
                            <span className="ml-2 font-bold">128</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 bg-black/80 rounded-xl border border-white/5 p-6 font-mono text-sm overflow-hidden flex flex-col shadow-2xl relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent shadow-[0_0_10px_rgba(99,102,241,0.5)]" />

                <div className="flex-1 overflow-y-auto no-scrollbar space-y-1">
                    {currentLogs.map((log, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="group flex gap-3"
                        >
                            <span className="text-white/20 select-none">{(i + 1).toString().padStart(3, '0')}</span>
                            <span className={
                                log.includes('[SYSTEM]') ? 'text-blue-400' :
                                    log.includes('[REGISTRY]') ? 'text-purple-400' :
                                        log.includes('[SCAN]') ? 'text-green-400' :
                                            log.includes('[ERROR]') ? 'text-red-400' :
                                                log.includes('[INFO]') ? 'text-cyan-400' :
                                                    'text-white/80'
                            }>
                                {log}
                            </span>
                        </motion.div>
                    ))}
                    <div ref={bottomRef} />
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2">
                    <span className="text-primary font-bold">λ</span>
                    <input
                        type="text"
                        placeholder="Enter debug command..."
                        className="flex-1 bg-transparent outline-none text-white italic placeholder:text-white/20"
                    />
                    <Search className="w-4 h-4 text-white/20" />
                </div>
            </div>
        </div>
    )
}
