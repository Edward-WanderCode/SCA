import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
    try {
        // PowerShell command to open folder browser dialog (Legacy Tree View)
        // User requested the Modern Dialog (IFileDialog), which requires more complex PS script.
        // We will execute a script file.
        const scriptPath = process.cwd() + '\\scripts\\browse-folder.ps1';
        const command = `powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;

        const { stdout, stderr } = await execAsync(command);

        if (stderr) {
            console.error('PowerShell Stderr:', stderr);
        }

        const selectedPath = stdout.trim();

        if (selectedPath) {
            return NextResponse.json({ success: true, path: selectedPath });
        } else {
            return NextResponse.json({ success: false, message: 'User cancelled or no path selected' });
        }
    } catch (error: any) {
        console.error('Select Folder Error:', error);
        return NextResponse.json({
            success: false,
            error: 'Could not open folder picker. Please enter path manually.',
            details: error.message
        }, { status: 500 });
    }
}
