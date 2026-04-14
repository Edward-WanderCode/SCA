import { PrismaClient } from './generated/prisma'

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

// Enable WAL mode for better concurrent performance with SQLite.
// WAL allows readers and a writer to operate concurrently, preventing
// "database is locked" errors when background scans write progress
// while the UI reads status simultaneously.
// Note: PRAGMA returns results, so we use $queryRawUnsafe instead of $executeRawUnsafe
if (!globalForPrisma.prisma) {
    prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL;')
        .then(() => console.log('[DB] SQLite WAL mode enabled'))
        .catch((err: Error) => console.warn('[DB] Could not enable WAL mode:', err.message));
    prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;')
        .catch(() => {}); // Set 5s busy timeout as fallback
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
