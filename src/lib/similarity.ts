import { prisma } from './prisma';
import { cosineSimilarity } from './ai';

export async function findSimilarRecords(targetId: string, limit: number = 5) {
    const targetRecord = await prisma.dataRecord.findUnique({
        where: { id: targetId },
    });

    if (!targetRecord || !targetRecord.embedding || targetRecord.embedding.length === 0) {
        throw new Error('Target record not found or has no embedding');
    }

    // PERFORMANCE NOTE: Current implementation uses in-memory similarity calculation
    // This approach pulls all records into memory and sorts them, which works well for demos
    // and small-to-medium datasets (< 10,000 records).
    //
    // For production scale (10,000+ records), consider migrating to pgvector:
    // 1. Add pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
    // 2. Change column type: ALTER TABLE data_records ALTER COLUMN embedding TYPE vector(1536);
    // 3. Add index: CREATE INDEX ON data_records USING ivfflat (embedding vector_cosine_ops);
    // 4. Use raw SQL: SELECT * FROM data_records ORDER BY embedding <=> $1 LIMIT 5;
    //
    // Benefits: 10-100x faster queries, constant memory usage, scalable to millions of vectors
    // TODO: Implement pgvector migration when dataset exceeds 10k records

    const allRecords = await prisma.dataRecord.findMany({
        where: {
            id: { not: targetId },
        },
    });

    // Filter out records without embeddings (since Prisma doesn't support isEmpty on Float[])
    const recordsWithEmbeddings = allRecords.filter(r => r.embedding && r.embedding.length > 0);

    const results = recordsWithEmbeddings.map(record => ({
        record,
        similarity: cosineSimilarity(targetRecord.embedding, record.embedding)
    }));

    return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}
