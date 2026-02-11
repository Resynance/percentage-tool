import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
const globalForPrisma = globalThis;
// Lazy initialize the database connection
function getPool() {
    if (!globalForPrisma.pool) {
        const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
        if (!databaseUrl) {
            throw new Error('Database URL not found. Set DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL environment variable.');
        }
        globalForPrisma.pool = new pg.Pool({ connectionString: databaseUrl });
    }
    return globalForPrisma.pool;
}
function getPrismaClient() {
    if (!globalForPrisma.prisma) {
        const pool = getPool();
        const adapter = new PrismaPg(pool);
        globalForPrisma.prisma = new PrismaClient({
            adapter,
            log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
        });
    }
    return globalForPrisma.prisma;
}
export const prisma = new Proxy({}, {
    get(target, prop) {
        const client = getPrismaClient();
        return client[prop];
    }
});
// Re-export all Prisma types
export * from '@prisma/client';
