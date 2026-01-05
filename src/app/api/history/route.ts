import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
    try {
        const historyFile = path.join(process.cwd(), '.sca-data', 'scans.json');

        try {
            const content = await fs.readFile(historyFile, 'utf-8');
            const history = JSON.parse(content);
            return NextResponse.json({ success: true, history });
        } catch (e) {
            // File doesn't exist or corrupted
            return NextResponse.json({ success: true, history: [] });
        }
    } catch (error: any) {
        console.error('API History Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ success: false, error: 'Missing scan ID' }, { status: 400 });
        }

        const historyFile = path.join(process.cwd(), '.sca-data', 'scans.json');
        const content = await fs.readFile(historyFile, 'utf-8');
        let history = JSON.parse(content);

        const initialLength = history.length;
        history = history.filter((scan: any) => scan.id !== id);

        if (history.length === initialLength) {
            return NextResponse.json({ success: false, error: 'Scan not found' }, { status: 404 });
        }

        await fs.writeFile(historyFile, JSON.stringify(history, null, 2));
        return NextResponse.json({ success: true, message: 'Scan deleted successfully' });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
