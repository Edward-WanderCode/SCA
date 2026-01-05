import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export async function POST(request: Request) {
    try {
        const { filePath, sourcePath, line = 1, column = 1, editor = 'vscode' } = await request.json();

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
                error: `File not found: ${absolutePath}`
            }, { status: 404 });
        }

        // Define command based on editor choice
        let command = '';
        const escapedPath = `"${absolutePath.replace(/\//g, '\\')}"`;

        switch (editor) {
            case 'cursor':
                command = `cursor --goto ${escapedPath}:${line}:${column}`;
                break;
            case 'sublime':
                command = `subl ${escapedPath}:${line}`;
                break;
            case 'notepadpp':
                command = `notepad++ -n${line} -c${column} ${escapedPath}`;
                break;
            case 'webstorm':
                command = `webstorm --line ${line} --column ${column} ${escapedPath}`;
                break;
            case 'intellij':
                command = `idea --line ${line} --column ${column} ${escapedPath}`;
                break;
            case 'vscode':
            default:
                command = `code --goto ${escapedPath}:${line}:${column}`;
                break;
        }

        console.log(`[Editor] Opening with ${editor}: ${command}`);

        exec(command, (error) => {
            if (error) {
                console.error(`Error opening in ${editor}:`, error);
                // Fallback to default system association if chosen editor fails
                if (editor === 'vscode') {
                    exec(`start "" ${escapedPath}`);
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('API Open Editor Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
