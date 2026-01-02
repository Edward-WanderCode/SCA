"use client"

import React, { useState, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
    GitBranch,
    Upload,
    Zap,
    Settings2,
    ChevronRight,
    Loader2,
    CheckCircle2,
    AlertCircle,
    FolderOpen,
    Code2,
    Monitor,
    Laptop,
    FileUp
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import ServerFileBrowserModal from "@/components/ServerFileBrowserModal"

type ScanStep = 'setup' | 'scanning' | 'results'

import { useSearchParams, useRouter } from "next/navigation"

// Wrapper component to handle Suspense boundary for useSearchParams
export default function ScanPage() {
    return (
        <Suspense fallback={
            <div className="max-w-4xl mx-auto space-y-8 flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        }>
            <ScanPageContent />
        </Suspense>
    )
}

function ScanPageContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [step, setStep] = useState<ScanStep>('setup')
    const [method, setMethod] = useState<'git' | 'upload' | 'folder'>('git')
    const [isScanning, setIsScanning] = useState(false)
    const [progress, setProgress] = useState(0)
    const [repoUrl, setRepoUrl] = useState('')
    const [folderPath, setFolderPath] = useState<string>('')
    const [ruleSet, setRuleSet] = useState('Community (Standard)')
    const [findings, setFindings] = useState<any[]>([])
    const [languages, setLanguages] = useState<string[]>([])
    const [missingPacks, setMissingPacks] = useState<string[]>([])
    const [activeScans, setActiveScans] = useState<any[]>([])
    const [scanStage, setScanStage] = useState('')
    const [scanDetails, setScanDetails] = useState('')
    const [folderSource, setFolderSource] = useState<'server' | 'client'>('server')
    const [clientFiles, setClientFiles] = useState<FileList | null>(null)
    const [analysisData, setAnalysisData] = useState<{
        files: number,
        rules: number,
        languages: { name: string, rules: number, files: number }[],
        origins: { name: string, rules: number }[]
    } | null>(null)
    const [showFileBrowser, setShowFileBrowser] = useState(false)


    const startScanWithParams = async (scanMethod: string, scanUrl: string, scanPath: string, compareId?: string) => {
        setIsScanning(true)
        setStep('scanning')
        setProgress(0)
        setScanStage('Initializing...')
        setScanDetails('')

        try {
            const response = await fetch('/api/scan/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: scanMethod === 'git' ? scanUrl : null,
                    folderPath: (scanMethod === 'folder') ? scanPath : null,
                    method: scanMethod,
                    ruleSet: ruleSet,
                    compareWithId: compareId
                })
            })

            if (!response.body) {
                throw new Error('No response body')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                const chunk = decoder.decode(value)
                const lines = chunk.split('\n')

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6))

                        if (data.error) {
                            throw new Error(data.error)
                        }

                        if (data.progress !== undefined) {
                            setProgress(data.progress)
                        }

                        if (data.stage) {
                            setScanStage(data.stage)
                        }

                        if (data.details) {
                            setScanDetails(data.details)
                        }

                        if (data.analysis) {
                            setAnalysisData(data.analysis)
                        }

                        if (data.scanId) {
                            // Immediately redirect to the live results/progress page
                            router.push(`/results/${data.scanId}`)
                            return // Exit the loop and function as we're navigating
                        }

                        if (data.result) {
                            // Scan completed
                            setFindings(data.result.findings || [])
                            setLanguages(data.result.language?.split(', ') || [])
                            setMissingPacks([])

                            setTimeout(() => {
                                setStep('results')
                                setIsScanning(false)
                            }, 500)
                        }
                    }
                }
            }
        } catch (error: any) {
            // Ignore abort errors from the browser refreshing/navigating
            if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('network error')) {
                return
            }
            console.error('Scan Error:', error)
            alert('An error occurred during scan: ' + error.message)
            setStep('setup')
            setIsScanning(false)
        }
    }

    const handleStartScan = async () => {
        if (method === 'folder' && folderSource === 'client') {
            if (!clientFiles || clientFiles.length === 0) {
                alert('Please select a folder to scan')
                return
            }

            setIsScanning(true)
            setStep('scanning')
            setScanStage('Uploading files...')
            setScanDetails('Uploading local files to scanner...')
            setProgress(0)

            try {
                const formData = new FormData()

                // Determine folder name from the first file's path
                let folderName = 'uploaded-project'
                if (clientFiles.length > 0 && clientFiles[0].webkitRelativePath) {
                    folderName = clientFiles[0].webkitRelativePath.split('/')[0]
                }
                formData.append('folderName', folderName)

                // Convert FileList to Array and append
                Array.from(clientFiles).forEach(file => {
                    // Use webkitRelativePath if available to preserve structure
                    const path = file.webkitRelativePath || file.name
                    formData.append('files', file, path)
                })

                const res = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                })

                if (!res.ok) {
                    const err = await res.json()
                    throw new Error(err.error || 'Upload failed')
                }

                const data = await res.json()

                if (data.success && data.path) {
                    // Start scan with the temp path on server
                    startScanWithParams('folder', '', data.path)
                } else {
                    throw new Error('Upload succeeded but no path returned')
                }
            } catch (error: any) {
                console.error('Upload Error:', error)
                alert('Upload failed: ' + error.message)
                setStep('setup')
                setIsScanning(false)
            }
        } else {
            startScanWithParams(method, repoUrl, folderPath)
        }
    }

    React.useEffect(() => {
        const methodParam = searchParams.get('method')
        const pathParam = searchParams.get('path')
        const compareId = searchParams.get('compareWithId')

        if (methodParam && pathParam) {
            setMethod(methodParam as any)
            if (methodParam === 'git') setRepoUrl(pathParam)
            else setFolderPath(pathParam)

            // Auto start if coming from rescan
            startScanWithParams(methodParam, pathParam, pathParam, compareId || undefined)
        }

        // Fetch active scans
        const fetchActiveScans = async () => {
            try {
                const res = await fetch('/api/history')
                const data = await res.json()
                if (data.success) {
                    const running = data.history.filter((s: any) => s.status === 'running')
                    setActiveScans(running)
                }
            } catch (e) {
                console.error('Failed to fetch active scans', e)
            }
        }

        fetchActiveScans()
        const poll = setInterval(fetchActiveScans, 5000)
        return () => clearInterval(poll)
    }, [])

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">New Analysis</h1>
                <p className="text-muted-foreground mt-1">Configure and launch a new static code analysis scan.</p>
            </div>

            <AnimatePresence mode="wait">
                {step === 'setup' && (
                    <motion.div
                        key="setup"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-6"
                    >


                        <div className="grid grid-cols-3 gap-4">
                            <button
                                onClick={() => setMethod('git')}
                                className={`p-6 rounded-xl border-2 transition-all flex flex-col gap-3 text-left ${method === 'git' ? 'border-primary bg-primary/5' : 'border-white/5 bg-white/5 hover:bg-white/10'
                                    }`}
                            >
                                <GitBranch className={`w-6 h-6 ${method === 'git' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <h3 className="font-semibold">Git Repository</h3>
                                    <p className="text-xs text-muted-foreground mt-1">Connect a remote repository.</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setMethod('folder')}
                                className={`p-6 rounded-xl border-2 transition-all flex flex-col gap-3 text-left ${method === 'folder' ? 'border-primary bg-primary/5' : 'border-white/5 bg-white/5 hover:bg-white/10'
                                    }`}
                            >
                                <FolderOpen className={`w-6 h-6 ${method === 'folder' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <h3 className="font-semibold">Server Directory</h3>
                                    <p className="text-xs text-muted-foreground mt-1">Scan a folder on the host.</p>
                                </div>
                            </button>
                            <button
                                onClick={() => setMethod('upload')}
                                className={`p-6 rounded-xl border-2 transition-all flex flex-col gap-3 text-left ${method === 'upload' ? 'border-primary bg-primary/5' : 'border-white/5 bg-white/5 hover:bg-white/10'
                                    }`}
                            >
                                <Upload className={`w-6 h-6 ${method === 'upload' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <h3 className="font-semibold">Upload Archive</h3>
                                    <p className="text-xs text-muted-foreground mt-1">Upload ZIP/TAR file.</p>
                                </div>
                            </button>
                        </div>

                        <div className="glass-card p-8 space-y-6">
                            {method === 'git' ? (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Repository URL</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="https://github.com/username/repo"
                                            value={repoUrl || ''}
                                            onChange={(e) => setRepoUrl(e.target.value)}
                                            className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors"
                                        />
                                        <button className="px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-medium rounded-lg transition-colors">
                                            Authenticate
                                        </button>
                                    </div>
                                </div>
                            ) : method === 'folder' ? (
                                <div className="space-y-4">
                                    <div className="bg-white/5 border-2 border-dashed border-white/10 rounded-xl p-8 hover:border-primary/30 transition-all group">
                                        <div className="flex flex-col items-center justify-center gap-4 text-center">
                                            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                <FolderOpen className="w-8 h-8 text-primary" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold">Directory Scan</h3>
                                                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                                    Analyze source code from a directory.
                                                </p>

                                                <div className="flex gap-2 justify-center mt-4 bg-black/20 p-1 rounded-lg">
                                                    <button
                                                        onClick={() => setFolderSource('server')}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${folderSource === 'server' ? 'bg-primary text-primary-foreground shadow' : 'hover:bg-white/5 text-muted-foreground'
                                                            }`}
                                                    >
                                                        <Monitor className="w-4 h-4" />
                                                        Server Host
                                                    </button>
                                                    <button
                                                        onClick={() => setFolderSource('client')}
                                                        className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-all ${folderSource === 'client' ? 'bg-primary text-primary-foreground shadow' : 'hover:bg-white/5 text-muted-foreground'
                                                            }`}
                                                    >
                                                        <Laptop className="w-4 h-4" />
                                                        This Workstation
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="w-full max-w-lg space-y-3 mt-2">
                                                {folderSource === 'server' ? (
                                                    <>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                key="server-folder-input"
                                                                type="text"
                                                                placeholder="e.g. D:\Code\MyProject (Server Path)"
                                                                value={folderPath ?? ''}
                                                                onChange={(e) => setFolderPath(e.target.value)}
                                                                className="flex-1 bg-black/20 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-primary transition-colors font-mono text-sm"
                                                            />
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    setShowFileBrowser(true);
                                                                }}
                                                                className="px-6 py-3 bg-secondary hover:bg-secondary/90 text-white font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                                                                title="Browse files on the server"
                                                            >
                                                                <FolderOpen className="w-4 h-4" />
                                                                Browse Files
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground text-left pl-1">
                                                            <strong>Note:</strong> "Server Host" scans a folder already existing on the server.
                                                        </p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="border border-dashed border-white/20 rounded-lg p-6 hover:bg-white/5 transition-colors cursor-pointer relative">
                                                            <input
                                                                type="file"
                                                                // @ts-ignore
                                                                webkitdirectory=""
                                                                directory=""
                                                                multiple
                                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                                onChange={(e) => setClientFiles(e.target.files)}
                                                            />
                                                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                                <FileUp className={`w-8 h-8 ${clientFiles ? 'text-primary' : ''}`} />
                                                                <span className="text-sm font-medium">
                                                                    {clientFiles ? `${clientFiles.length} files selected` : 'Choose folder to upload...'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs text-muted-foreground text-left pl-1">
                                                            <strong>Note:</strong> Files will be uploaded to a temporary secure location for scanning.
                                                        </p>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                                        <div className="flex gap-3">
                                            <Settings2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                                            <div className="text-xs text-blue-200 space-y-1">
                                                <p className="font-semibold">Local Scanning Tips:</p>
                                                <ul className="list-disc list-inside space-y-1 text-blue-200/80">
                                                    <li>Use absolute paths (e.g., <code className="bg-blue-500/10 px-1 rounded">C:\Users\...</code>)</li>
                                                    <li>Ensure the folder contains source code files</li>
                                                    <li>Large folders may take longer to scan</li>
                                                    <li className="text-emerald-300 font-medium">✓ Files up to 100MB are now supported</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="border-2 border-dashed border-white/10 rounded-xl p-12 flex flex-col items-center justify-center gap-4 hover:border-primary/50 transition-colors cursor-pointer">
                                    <Upload className="w-12 h-12 text-muted-foreground" />
                                    <div className="text-center">
                                        <p className="font-medium">Click to select or drag and drop</p>
                                        <p className="text-sm text-muted-foreground mt-1">ZIP, TAR or individual source files</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-6 pt-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Target Language</label>
                                    <select className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors appearance-none">
                                        <option>Auto-detect</option>
                                        <option>TypeScript / JavaScript</option>
                                        <option>Python</option>
                                        <option>Go</option>
                                        <option>Java</option>
                                        <option>C / C++</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Rule Set</label>
                                    <select
                                        value={ruleSet}
                                        onChange={(e) => setRuleSet(e.target.value)}
                                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-primary transition-colors appearance-none"
                                    >
                                        <option>Community (Standard)</option>
                                        <option>Security (High Intensity)</option>
                                        <option>Compliance (SOC2/PCI-DSS)</option>
                                        <option>Best Practices only</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-500/5 p-3 rounded-lg border border-blue-500/10">
                                <Settings2 className="w-4 h-4 text-blue-400" />
                                Advanced configuration: Continuous monitoring, Slack notifications, and Webhooks can be configured later.
                            </div>
                        </div>

                        {/* Active Scans Indicator */}
                        {
                            activeScans.length > 0 && (
                                <div className="glass-card p-4 border-l-4 border-l-blue-500 bg-blue-500/5">
                                    <h4 className="text-sm font-bold flex items-center gap-2 text-blue-400 mb-3">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Active Background Scans ({activeScans.length})
                                    </h4>
                                    <div className="space-y-2">
                                        {activeScans.map(scan => {
                                            // Assuming 'Link' component is imported from 'next/link' or similar
                                            // If not, you'll need to add `import Link from 'next/link';` at the top of your file.
                                            return (
                                                <div key={scan.id} className="flex items-center justify-between text-sm bg-black/20 p-2 rounded border border-white/5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs text-muted-foreground">{scan.id}</span>
                                                        <span className="font-medium">{scan.source.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-[10px] text-blue-400 animate-pulse uppercase font-bold">Running</span>
                                                        <Link
                                                            href={`/results/${scan.id}`}
                                                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition-colors"
                                                        >
                                                            View Live
                                                        </Link>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )
                        }

                        <div className="flex justify-end">
                            <button
                                onClick={handleStartScan}
                                className="flex items-center gap-2 bg-primary px-8 py-3 rounded-lg font-bold text-lg hover:opacity-90 transition-all glow-primary"
                            >
                                <Zap className="w-5 h-5 fill-current" />
                                Launch Analysis
                            </button>
                        </div>
                    </motion.div>
                )
                }

                {
                    step === 'scanning' && (
                        <motion.div
                            key="scanning"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass-card p-12 flex flex-col gap-8 min-h-[500px]"
                        >
                            <div className="flex items-center justify-between w-full">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 rounded-full border-4 border-white/5 flex items-center justify-center">
                                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold">{scanStage || 'Analysis in Progress'}</h2>
                                        <p className="text-sm text-muted-foreground">
                                            {scanDetails || 'Running Opengrep & Trivy rules...'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-3xl font-mono font-bold text-primary">
                                        {Math.round(progress)}%
                                    </div>
                                    <div className="text-xs text-muted-foreground uppercase tracking-widest">Progress</div>
                                </div>
                            </div>

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
                                                {analysisData.languages.map((lang, i) => (
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
                                                {analysisData.origins.map((origin, i) => (
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
                                        className="h-full bg-primary"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )
                }

                {
                    step === 'results' && (
                        <motion.div
                            key="results"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-6"
                        >
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center justify-between p-6 bg-green-500/10 border border-green-500/20 rounded-xl">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                                            <CheckCircle2 className="w-7 h-7 text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold">Analysis Complete</h2>
                                            <p className="text-sm text-green-400">Scan finished successfully with {findings.length} findings.</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setStep('setup')}
                                            className="px-4 py-2 border border-green-500/30 rounded-lg hover:bg-green-500/10 transition-colors font-semibold"
                                        >
                                            Re-scan
                                        </button>
                                    </div>
                                </div>

                                {/* Multi-language and Missing Packs Summary */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="glass-card p-4 border-l-4 border-l-blue-500">
                                        <h4 className="text-sm font-bold flex items-center gap-2">
                                            <Code2 className="w-4 h-4 text-blue-400" />
                                            Detected Languages
                                        </h4>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {languages.length > 0 ? languages.map(lang => (
                                                <span key={lang} className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-md border border-blue-500/20">
                                                    {lang}
                                                </span>
                                            )) : <span className="text-xs text-muted-foreground">None detected</span>}
                                        </div>
                                    </div>

                                    {missingPacks.length > 0 && (
                                        <div className="glass-card p-4 border-l-4 border-l-amber-500 bg-amber-500/5">
                                            <h4 className="text-sm font-bold flex items-center gap-2 text-amber-500">
                                                <AlertCircle className="w-4 h-4" />
                                                Missing Rulepacks
                                            </h4>
                                            <p className="text-[10px] text-amber-200/70 mt-1">
                                                No comprehensive security rulepacks available for:
                                            </p>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {missingPacks.map(lang => (
                                                    <span key={lang} className="px-2 py-1 bg-amber-500/10 text-amber-500 text-xs rounded-md border border-amber-500/20 font-medium">
                                                        {lang} Pack
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {findings.map((finding, idx) => (
                                    <div key={idx} className={cn(
                                        "glass-card p-6 flex flex-col gap-2 border-l-4",
                                        finding.severity === 'critical' || finding.severity === 'high' ? 'border-l-red-500' :
                                            finding.severity === 'medium' ? 'border-l-yellow-500' : 'border-l-blue-500'
                                    )}>
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                                finding.severity === 'critical' || finding.severity === 'high' ? 'bg-red-500/10 text-red-500' :
                                                    finding.severity === 'medium' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-blue-500/10 text-blue-500'
                                            )}>{finding.severity}</span>
                                            <AlertCircle className={cn(
                                                "w-4 h-4",
                                                finding.severity === 'critical' || finding.severity === 'high' ? 'text-red-500' :
                                                    finding.severity === 'medium' ? 'text-yellow-500' : 'text-blue-500'
                                            )} />
                                        </div>
                                        <h3 className="font-bold text-base mt-2 tracking-tight line-clamp-1">{finding.title}</h3>
                                        <p className="text-xs text-muted-foreground line-clamp-2">{finding.message}</p>
                                        <p className="text-[10px] text-muted-foreground mt-1 font-mono bg-black/30 p-1 rounded truncate">
                                            {finding.file}:{finding.line}
                                        </p>
                                        <Link href={`/results/${finding.id}`} className="mt-4 flex items-center gap-1 text-sm text-primary hover:underline font-medium">
                                            View Detail <ChevronRight className="w-3 h-3" />
                                        </Link>
                                    </div>
                                ))}

                                {findings.length === 0 && (
                                    <div className="col-span-full py-12 flex flex-col items-center justify-center bg-white/5 rounded-xl border border-dashed border-white/10">
                                        <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
                                        <h3 className="text-xl font-bold">No vulnerabilities found</h3>
                                        <p className="text-muted-foreground">Your code looks secure according to the current rule set.</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end pt-4">
                                <button className="bg-white text-black px-6 py-2 rounded-lg font-bold hover:bg-slate-200 transition-colors">
                                    Export Full Report (PDF)
                                </button>
                            </div>
                        </motion.div>
                    )}
            </AnimatePresence>

            <ServerFileBrowserModal
                isOpen={showFileBrowser}
                onClose={() => setShowFileBrowser(false)}
                onSelect={(path) => {
                    setFolderPath(path);
                    setShowFileBrowser(false);
                }}
                initialPath={folderPath}
            />
        </div>
    )
}
