import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

async function migrateData() {
    try {
        console.log('🔄 Starting migration from JSON to SQLite...');

        // Read JSON file
        const dataDir = path.join(process.cwd(), '.sca-data');
        const historyFile = path.join(dataDir, 'scans.json');

        let scans = [];
        try {
            const content = await fs.readFile(historyFile, 'utf-8');
            scans = JSON.parse(content);
            console.log(`📁 Found ${scans.length} scans in JSON file`);
        } catch (error) {
            console.log('⚠️  No existing scans.json file found. Starting fresh.');
            return;
        }

        // Migrate each scan
        for (const scan of scans) {
            console.log(`\n📝 Migrating scan: ${scan.id}`);

            try {
                // Create scan record
                await prisma.scan.create({
                    data: {
                        id: scan.id,
                        timestamp: new Date(scan.timestamp),
                        status: scan.status || 'completed',

                        // Source
                        sourceName: scan.source?.name || 'Unknown',
                        sourceType: scan.source?.type || 'local',
                        sourceUrl: scan.source?.url || null,
                        sourcePath: scan.source?.path || null,

                        // Stats
                        filesScanned: scan.stats?.filesScanned || 0,
                        linesScanned: scan.stats?.linesScanned || 0,
                        duration: scan.stats?.duration || 0,
                        sastCount: scan.stats?.sastCount || 0,
                        trivyCount: scan.stats?.trivyCount || 0,

                        // Findings count
                        criticalCount: scan.stats?.findings?.critical || 0,
                        highCount: scan.stats?.findings?.high || 0,
                        mediumCount: scan.stats?.findings?.medium || 0,
                        lowCount: scan.stats?.findings?.low || 0,
                        infoCount: scan.stats?.findings?.info || 0,

                        // JSON fields
                        languages: JSON.stringify(scan.languages || []),
                        logs: scan.logs || null,
                        fileTree: JSON.stringify(scan.fileTree || []),
                        analysis: scan.analysis ? JSON.stringify(scan.analysis) : null,

                        // Comparison
                        isRescan: scan.isRescan || false,
                        comparedWithId: scan.comparedWithId || null,

                        // Findings (relationship)
                        findings: {
                            create: (scan.findings || []).map((f: any) => ({
                                fingerprint: f.fingerprint || `${f.title}|${f.file}|${f.line}`,
                                isNew: f.isNew || false,
                                title: f.title || 'Unknown',
                                severity: f.severity || 'info',
                                message: f.message || '',
                                category: f.category || 'Security',
                                file: f.file || '',
                                line: f.line || 0,
                                column: f.column || 0,
                                code: f.code || '',
                                fix: f.fix || null,
                                cwe: f.cwe || null,
                                owasp: f.owasp || null,
                            })),
                        },
                    },
                });

                console.log(`   ✅ Migrated scan ${scan.id} with ${scan.findings?.length || 0} findings`);
            } catch (error: any) {
                if (error.code === 'P2002') {
                    console.log(`   ⚠️  Scan ${scan.id} already exists, skipping...`);
                } else {
                    console.error(`   ❌ Error migrating scan ${scan.id}:`, error.message);
                }
            }
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Database Statistics:');
        const totalScans = await prisma.scan.count();
        const totalFindings = await prisma.finding.count();
        console.log(`   - Total Scans: ${totalScans}`);
        console.log(`   - Total Findings: ${totalFindings}`);

        // Backup JSON file
        const backupFile = path.join(dataDir, `scans.json.backup.${Date.now()}`);
        await fs.copyFile(historyFile, backupFile);
        console.log(`\n💾 Backup created: ${backupFile}`);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

migrateData()
    .then(() => {
        console.log('\n🎉 All done!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
