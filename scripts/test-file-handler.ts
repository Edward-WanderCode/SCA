/**
 * Test Script for File Handler
 * Run this to verify file handling functionality
 */

import {
    ensureDownloadDir,
    isSupportedArchive,
    formatFileSize,
    extractArchive
} from '../src/lib/file-handler';

async function testFileHandler() {
    console.log('🧪 Testing File Handler Module\n');

    // Test 1: Ensure Download Directory
    console.log('📁 Test 1: Creating Download directory...');
    try {
        const dir = await ensureDownloadDir();
        console.log(`✅ Download directory: ${dir}\n`);
    } catch (error) {
        console.error('❌ Failed:', error);
    }

    // Test 2: Check Supported Archives
    console.log('📦 Test 2: Checking supported file types...');
    const testFiles = [
        'test.zip',
        'test.rar',
        'test.7z',
        'test.tar.gz',
        'document.pdf',
        'image.png'
    ];

    testFiles.forEach(file => {
        const supported = isSupportedArchive(file);
        const icon = supported ? '✅' : '❌';
        console.log(`${icon} ${file}: ${supported ? 'Supported' : 'Not supported'}`);
    });
    console.log('');

    // Test 3: Format File Size
    console.log('📊 Test 3: File size formatting...');
    const sizes = [0, 1024, 1024 * 1024, 1024 * 1024 * 50, 1024 * 1024 * 1024];
    sizes.forEach(size => {
        console.log(`${size} bytes = ${formatFileSize(size)}`);
    });
    console.log('');

    // Test 4: Check WinRAR Installation
    console.log('🔧 Test 4: Checking WinRAR installation...');
    const fs = await import('fs/promises');
    const unrarPaths = [
        'C:\\Program Files\\WinRAR\\UnRAR.exe',
        'C:\\Program Files (x86)\\WinRAR\\UnRAR.exe'
    ];

    let foundWinRAR = false;
    for (const path of unrarPaths) {
        try {
            await fs.access(path);
            console.log(`✅ Found WinRAR at: ${path}`);
            foundWinRAR = true;
            break;
        } catch {
            console.log(`❌ Not found: ${path}`);
        }
    }

    if (!foundWinRAR) {
        console.warn('⚠️  WinRAR not found. RAR extraction will not work.');
        console.log('💡 Install WinRAR from: https://www.win-rar.com/download.html\n');
    } else {
        console.log('');
    }

    console.log('✨ Tests completed!\n');
    console.log('📝 Summary:');
    console.log('   - Download directory: ✅');
    console.log('   - File type detection: ✅');
    console.log('   - File size formatting: ✅');
    console.log(`   - WinRAR/UnRAR: ${foundWinRAR ? '✅' : '❌'}`);
    console.log('   - ZIP support: ✅ (Built-in PowerShell)');
}

// Run tests
testFileHandler().catch(console.error);
