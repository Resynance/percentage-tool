/**
 * Retroactive Vectorization Script
 *
 * This script creates ingestion jobs for environments that have records without embeddings,
 * then triggers the vectorization process to generate embeddings for all records.
 *
 * Usage: npx tsx scripts/retroactive-vectorization.ts
 */

import { prisma } from '@repo/database';
import { processQueuedJobs } from '@repo/core/ingestion';

async function main() {
    console.log('🔍 Finding environments with missing embeddings...\n');

    // Get environments that have records without embeddings
    const environmentsWithMissingEmbeddings = await prisma.$queryRaw<Array<{
        environment: string;
        total: bigint;
        missing: bigint;
    }>>`
        SELECT
            environment,
            COUNT(*) as total,
            COUNT(*) - COUNT(embedding) as missing
        FROM data_records
        GROUP BY environment
        HAVING COUNT(*) - COUNT(embedding) > 0
        ORDER BY environment
    `;

    if (environmentsWithMissingEmbeddings.length === 0) {
        console.log('✅ All records already have embeddings!');
        return;
    }

    console.log(`Found ${environmentsWithMissingEmbeddings.length} environments with missing embeddings:\n`);

    for (const env of environmentsWithMissingEmbeddings) {
        console.log(`  - ${env.environment}: ${env.missing.toString()}/${env.total.toString()} records missing embeddings`);
    }

    console.log('\n📦 Creating vectorization jobs...\n');

    // Create a QUEUED_FOR_VEC job for each environment
    const jobs = [];
    for (const env of environmentsWithMissingEmbeddings) {
        const job = await prisma.ingestJob.create({
            data: {
                environment: env.environment,
                type: 'TASK', // Doesn't matter for vectorization
                status: 'QUEUED_FOR_VEC',
                payload: null, // No payload needed for retroactive vectorization
                options: {
                    source: 'retroactive-vectorization',
                    generateEmbeddings: true
                },
                totalRecords: Number(env.total),
                savedCount: Number(env.total)
            }
        });

        console.log(`  ✓ Created job ${job.id} for ${env.environment}`);
        jobs.push(job);
    }

    console.log(`\n🚀 Starting vectorization for ${jobs.length} environments...\n`);

    // Trigger vectorization for all environments
    await processQueuedJobs();

    console.log('\n✅ Vectorization triggered! Monitor progress at:');
    console.log('   http://localhost:3004/ingest (Fleet app)\n');

    console.log('💡 The vectorization will run in the background.');
    console.log('   Refresh the ingestion page to see progress updates.\n');
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
