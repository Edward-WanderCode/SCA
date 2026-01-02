
import { NextResponse } from 'next/server'
import { join } from 'path'
import { mkdir, writeFile } from 'fs/promises'
import { v4 as uuidv4 } from 'uuid'
import os from 'os'

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const files = formData.getAll('files') as File[]
        const folderName = formData.get('folderName') as string || 'uploaded-source'

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
        }

        // Create a temporary directory in project root Remote folder
        const scanId = uuidv4()
        // Create deeper structure: Remote/scanId/folderName
        const tempDir = join(process.cwd(), 'Remote', scanId, folderName)
        await mkdir(tempDir, { recursive: true })

        let fileCount = 0

        for (const file of files) {
            // Check if it's a file
            if (!file.name) continue

            const bytes = await file.arrayBuffer()
            const buffer = Buffer.from(bytes)

            // Handling relative paths if provided in filename (custom append on client)
            // or just flat for now if complex.
            // Client should append 'files' with filename as the relative path.

            const filePath = join(tempDir, file.name)

            // Ensure directory exists for the file
            const fileDir = join(filePath, '..')
            await mkdir(fileDir, { recursive: true })

            await writeFile(filePath, buffer)
            fileCount++
        }

        return NextResponse.json({
            success: true,
            path: tempDir,
            files: fileCount
        })

    } catch (error: any) {
        console.error('Upload error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
