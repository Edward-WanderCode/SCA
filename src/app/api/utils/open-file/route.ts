import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request: Request) {
    try {
        const { filePath, sourcePath } = await request.json();

        if (!filePath) {
            return NextResponse.json({ success: false, error: 'File path is required' }, { status: 400 });
        }

        // Construct absolute path
        let absolutePath = filePath;
        if (sourcePath && !path.isAbsolute(filePath)) {
            absolutePath = path.join(sourcePath, filePath);
        }

        // Verify file exists
        try {
            await fs.access(absolutePath);
        } catch (error) {
            return NextResponse.json({
                success: false,
                error: `File not found: ${absolutePath}. It might have been deleted or moved.`
            }, { status: 404 });
        }

        // Open in explorer and select the file
        // Windows: explorer /select,"path\to\file"
        const command = `explorer.exe /select,"${absolutePath.replace(/\//g, '\\')}"`;

        exec(command, (error) => {
            if (error) {
                console.error('Error opening file location:', error);
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('API Open File Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
