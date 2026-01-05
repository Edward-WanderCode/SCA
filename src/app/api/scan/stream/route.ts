import { NextResponse } from 'next/server'
import { saveScanToDatabase } from '@/lib/db-helpers'
import { logger } from '@/lib/logger'
import { spawn } from 'child_process'
import path from 'path'

export const maxDuration = 300;

export async function POST(request: Request) {
    try {
        console.log('[STREAM] Request received, parsing body...')
        const { url, method, folderPath, ruleSet = 'Community (Standard)', compareWithId } = await request.json()
        console.log(`[STREAM] Method: ${method}, URL: ${url}, Folder: ${folderPath}`)

        // Generate scanId IMMEDIATELY
        const scanId = `scan-${Math.random().toString(36).substring(7)}`
        console.log(`[STREAM] Generated scanId: ${scanId}`)

        let targetPath = process.cwd()
        let isTemp = false

        // For git repos, clone first (or we can let the worker do it)
        // For simplicity, we'll pass the config to the worker and let it handle everything

        const timestamp = new Date().toISOString()

        // Create initial scan record in database
        const runningScan = {
            id: scanId,
            timestamp: timestamp,
            status: 'running',
            source: {
                type: method,
                name: method === 'git' ? (url?.split('/').pop() || 'Repo') : (folderPath?.split(/[\\/]/).pop() || 'Local Folder'),
                url: method === 'git' ? url : null,
                path: method === 'folder' ? folderPath : null,
            },
            stats: {
                filesScanned: 0,
                linesScanned: 0,
                duration: 0,
                findings: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
            },
            findings: [],
            languages: [],
            missingPacks: []
        }

        await saveScanToDatabase(runningScan as any)
        console.log(`[STREAM] Created scan record in database: ${scanId}`)

        // Prepare config for background worker
        const workerConfig = {
            method,
            url,
            folderPath,
            ruleSet,
            compareWithId,
        }

        // Spawn background worker process
        const workerScript = path.join(process.cwd(), 'src', 'lib', 'background-worker.ts')
        const configJson = JSON.stringify(workerConfig)

        console.log(`[STREAM] Spawning background worker for scan: ${scanId}`)

        // Use tsx to run TypeScript directly, or ts-node
        // Note: In production, you'd want to compile this to JS first
        const worker = spawn('npx', ['tsx', workerScript, scanId, configJson], {
            detached: true,
            stdio: 'ignore', // Don't pipe stdio to parent
            cwd: process.cwd(),
        })

        // Detach the worker so it continues running after parent exits
        worker.unref()

        console.log(`[STREAM] Background worker spawned with PID: ${worker.pid}`)

        // Send immediate response with scanId
        logger.updateScanProgress(scanId, 5, 'Initializing scan...', 'Background worker started')

        return NextResponse.json({
            success: true,
            scanId: scanId,
            message: 'Scan started in background',
            notice: 'This scan will continue running even if you close this page.'
        })

    } catch (error: any) {
        console.error('[STREAM] Error starting scan:', error)
        return NextResponse.json({
            success: false,
            error: error.message
        }, { status: 500 })
    }
}
