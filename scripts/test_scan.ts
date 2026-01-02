
import { runScan } from '../src/lib/scanner';

const target = process.argv[2] || "E:\\Code\\repos\\Edward-WanderCode\\BCGS-NOC\\GiaoBanTrucNOC";

console.log("--- STARTING MANUAL SCAN TEST ---");
console.log(`Target: ${target}`);

async function main() {
    try {
        const start = Date.now();
        const result = await runScan(target);
        const duration = (Date.now() - start) / 1000;

        console.log("--- SCAN RESULT SUMMARY ---");
        console.log(`Duration: ${duration}s`);
        console.log(`Findings: ${result.findings.length}`);
        console.log(`Languages: ${result.languages.join(', ')}`);
        console.log(`Scanned Files: ${result.scannedFiles}`);
        console.log(`Scanned Lines: ${result.scannedLines}`);
        console.log(`Missing Packs: ${result.missingPacks.join(', ')}`);

    } catch (error) {
        console.error("Scan failed:", error);
    }
}

main();
