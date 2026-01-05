import { NextResponse } from 'next/server'
import { saveScanToDatabase } from '@/lib/db-helpers'
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

        // Small delay to ensure DB transaction completes
        await new Promise(resolve => setTimeout(resolve, 100));

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

        // Use tsx to run TypeScript directly
        const fs = await import('fs');
        const logFile = path.join(process.cwd(), 'logs', `worker-${scanId}.log`);
        const errFile = path.join(process.cwd(), 'logs', `worker-${scanId}.err`);

        // Ensure logs directory exists
        await fs.promises.mkdir(path.join(process.cwd(), 'logs'), { recursive: true });

        // Windows: Use START command to create truly independent process
        const isWindows = process.platform === 'win32';

        let worker;
        if (isWindows) {
            // Create batch script for proper redirection
            const batchContent = `@echo off\r\nnpx tsx "${workerScript}" ${scanId} "${configJson.replace(/"/g, '\\"')}" > "${logFile}" 2> "${errFile}"`;
            const batchFile = path.join(process.cwd(), 'logs', `worker-${scanId}.bat`);
            await fs.promises.writeFile(batchFile, batchContent);

            // START /B = run in background without new window
            worker = spawn('cmd', ['/c', 'start', '/B', batchFile], {
                stdio: 'ignore',
                cwd: process.cwd(),
                detached: true,
                windowsHide: true,
            });
            worker.unref();
        } else {
            // Unix: Use standard detached spawn
            worker = spawn('npx', ['tsx', workerScript, scanId, configJson], {
                stdio: ['ignore',
                    fs.openSync(logFile, 'w'),
                    fs.openSync(errFile, 'w')
                ],
                cwd: process.cwd(),
                detached: true,
            });
            worker.unref();
        }

        console.log(`[STREAM] Background worker spawned with PID: ${worker.pid}`)

        // Worker will update progress via database

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
