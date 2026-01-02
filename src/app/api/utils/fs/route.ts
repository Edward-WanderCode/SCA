import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const dirPath = searchParams.get('path');

    try {
        // If no path is provided, return list of drives (Windows) or Root (Unix)
        if (!dirPath) {
            if (os.platform() === 'win32') {
                try {
                    const { stdout } = await execAsync('wmic logicaldisk get name');
                    const drives = stdout.split('\r\n')
                        .filter(line => /[A-Z]:/.test(line)) // Matches C:, D:, etc.
                        .map(line => line.trim())
                        .map(drive => ({
                            name: drive,
                            path: drive + '\\',
                            isDirectory: true,
                            isDrive: true
                        }));
                    return NextResponse.json({ items: drives, currentPath: '' });
                } catch (e) {
                    console.error('Failed to list drives', e);
                    // Fallback to C:\ if wmic fails
                    return NextResponse.json({
                        items: [{ name: 'C:', path: 'C:\\', isDirectory: true, isDrive: true }],
                        currentPath: ''
                    });
                }
            } else {
                return NextResponse.json({
                    items: [{ name: '/', path: '/', isDirectory: true, isDrive: true }],
                    currentPath: '/'
                });
            }
        }

        // Validate path existence
        try {
            await fs.access(dirPath);
        } catch {
            return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
        }

        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        const items = await Promise.all(entries.map(async (entry) => {
            try {
                // Determine full path
                const fullPath = path.join(dirPath, entry.name);

                return {
                    name: entry.name,
                    path: fullPath,
                    isDirectory: entry.isDirectory(),
                    isSymlink: entry.isSymbolicLink()
                };
            } catch (e) {
                return null;
            }
        }));

        // Filter out nulls and hidden files (optional, but good for UI)
        const validItems = items
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => {
                // Directories first
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            });

        return NextResponse.json({ items: validItems, currentPath: dirPath });

    } catch (error: any) {
        console.error('FS Error:', error);
        return NextResponse.json({
            error: 'Failed to read directory',
            details: error.message
        }, { status: 500 });
    }
}
