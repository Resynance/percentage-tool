#!/usr/bin/env tsx
/**
 * Migration Script: Move Data Records to Production
 *
 * DEPRECATED: This script queries the `projects` table which was removed in the
 * project→environment refactor (Feb 2026). Do NOT run this script against a
 * database that has already been migrated; it will fail at the project mapping step.
 *
 * If you need to migrate data records between databases after the refactor,
 * write a new script that uses the `environment` field on `data_records` directly.
 *
 * This script copies data records from a source database to a production database
 * in batches with progress logging. Ensures project keys match between databases.
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." tsx scripts/migrate-data-records-to-prod.ts
 */

import { Client } from 'pg';
import * as readline from 'readline';

// ============================================================================
// Configuration
// ============================================================================

const SOURCE_DATABASE_URL = process.env.SOURCE_DATABASE_URL;
const TARGET_DATABASE_URL = process.env.TARGET_DATABASE_URL;
const BATCH_SIZE = 500;
const DRY_RUN = process.env.DRY_RUN === 'true';

// ============================================================================
// Validation
// ============================================================================

if (!SOURCE_DATABASE_URL) {
  console.error('❌ SOURCE_DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!TARGET_DATABASE_URL) {
  console.error('❌ TARGET_DATABASE_URL environment variable is required');
  process.exit(1);
}

// ============================================================================
// Helper Functions
// ============================================================================

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function maskConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username ? '***:***@' : ''}${parsed.host}${parsed.pathname}`;
  } catch {
    return '***';
  }
}

// ============================================================================
// Migration Logic
// ============================================================================

async function migrateDataRecords() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Data Records Migration');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`📤 Source:      ${maskConnectionString(SOURCE_DATABASE_URL)}`);
  console.log(`📥 Target:      ${maskConnectionString(TARGET_DATABASE_URL)}`);
  console.log(`📦 Batch size:  ${BATCH_SIZE} records`);
  console.log(`🧪 Dry run:     ${DRY_RUN ? 'YES (no data will be written)' : 'NO (will write to target)'}`);
  console.log('');

  // Add SSL parameters to connection strings if not localhost
  const addSSLParams = (url: string) => {
    if (url.includes('localhost')) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}sslmode=no-verify`;
  };

  const sourceClient = new Client({
    connectionString: addSSLParams(SOURCE_DATABASE_URL),
    ssl: SOURCE_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  const targetClient = new Client({
    connectionString: addSSLParams(TARGET_DATABASE_URL),
    ssl: TARGET_DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });

  try {
    // Test connections
    console.log('🔌 Testing database connections...');
    await sourceClient.connect();
    await targetClient.connect();
    console.log('✅ Connected to both databases');
    console.log('');

    // Get project mapping (source project ID -> target project ID)
    console.log('📊 Building project key mapping...');
    const sourceProjectsResult = await sourceClient.query(
      'SELECT id, name FROM projects ORDER BY name'
    );
    const targetProjectsResult = await targetClient.query(
      'SELECT id, name FROM projects ORDER BY name'
    );

    const projectMapping = new Map<string, string>();
    const unmatchedProjects: string[] = [];

    for (const sourceProject of sourceProjectsResult.rows) {
      const targetProject = targetProjectsResult.rows.find(
        (tp: any) => tp.name === sourceProject.name
      );
      if (targetProject) {
        projectMapping.set(sourceProject.id, targetProject.id);
        console.log(`   ✅ ${sourceProject.name}: ${sourceProject.id} → ${targetProject.id}`);
      } else {
        unmatchedProjects.push(sourceProject.name);
        console.log(`   ❌ ${sourceProject.name}: No matching project in target`);
      }
    }

    console.log('');
    console.log(`📊 Project mapping: ${projectMapping.size} matched, ${unmatchedProjects.length} unmatched`);

    if (unmatchedProjects.length > 0) {
      console.log('⚠️  WARNING: Records from unmatched projects will be skipped:');
      unmatchedProjects.forEach(name => console.log(`   - ${name}`));
      console.log('');
    }

    // Count records in source by project
    console.log('📊 Analyzing source database...');
    const sourceCountResult = await sourceClient.query(
      'SELECT COUNT(*) FROM data_records'
    );
    const sourceCount = parseInt(sourceCountResult.rows[0].count);
    console.log(`   Found ${sourceCount.toLocaleString()} total records in source database`);

    // Count records for matched projects
    const matchedProjectIds = Array.from(projectMapping.keys());
    const matchedCountResult = await sourceClient.query(
      'SELECT COUNT(*) FROM data_records WHERE "projectId"::text = ANY($1::text[])',
      [matchedProjectIds]
    );
    const matchedCount = parseInt(matchedCountResult.rows[0].count);
    console.log(`   Found ${matchedCount.toLocaleString()} records in matched projects (will migrate)`);
    console.log(`   Found ${(sourceCount - matchedCount).toLocaleString()} records in unmatched projects (will skip)`);

    if (matchedCount === 0) {
      console.log('⚠️  No records to migrate. Exiting.');
      return;
    }

    // Count existing records in target
    console.log('📊 Analyzing target database...');
    const targetCountResult = await targetClient.query(
      'SELECT COUNT(*) FROM data_records'
    );
    const targetCount = parseInt(targetCountResult.rows[0].count);
    console.log(`   Found ${targetCount.toLocaleString()} existing records in target database`);
    console.log('');

    // Get sample of what will be migrated
    const sampleResult = await sourceClient.query(
      `SELECT id, type, content, "projectId", "createdByEmail", "createdAt"
       FROM data_records
       WHERE "projectId"::text = ANY($1::text[])
       ORDER BY "createdAt" DESC
       LIMIT 3`,
      [matchedProjectIds]
    );

    console.log('📋 Sample records to migrate:');
    sampleResult.rows.forEach((record: any, i: number) => {
      const sourceProjectId = record.projectId;
      const targetProjectId = projectMapping.get(sourceProjectId);
      console.log(`   ${i + 1}. ${record.type} - ${record.content?.substring(0, 50)}...`);
      console.log(`      Project: ${sourceProjectId} → ${targetProjectId}`);
      console.log(`      Author: ${record.createdByEmail}, Created: ${record.createdAt}`);
    });
    console.log('');

    // Confirmation
    if (!DRY_RUN) {
      console.log('⚠️  WARNING: This will INSERT records into the PRODUCTION database!');
      console.log('⚠️  Project IDs will be remapped to match target database');
      console.log('⚠️  Duplicate records will be skipped (based on unique constraints)');
      console.log('');

      const confirmed = await askConfirmation('❓ Are you sure you want to continue? (y/N): ');

      if (!confirmed) {
        console.log('❌ Migration cancelled by user');
        return;
      }
      console.log('');
    }

    // Fetch all records from source for matched projects
    console.log('📤 Fetching all records from source database...');
    const startFetch = Date.now();
    const allRecordsResult = await sourceClient.query(
      `SELECT * FROM data_records
       WHERE "projectId"::text = ANY($1::text[])
       ORDER BY "createdAt" ASC`,
      [matchedProjectIds]
    );
    const allRecords = allRecordsResult.rows;
    const fetchTime = ((Date.now() - startFetch) / 1000).toFixed(2);
    console.log(`✅ Fetched ${allRecords.length.toLocaleString()} records in ${fetchTime}s`);
    console.log('');

    // Split into batches
    const batches = chunkArray(allRecords, BATCH_SIZE);
    console.log(`📦 Split into ${batches.length} batches of ${BATCH_SIZE} records each`);
    console.log('');

    if (DRY_RUN) {
      console.log('🧪 DRY RUN MODE - Simulating migration without writing data');
      console.log('');
    }

    // Migrate each batch
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const startMigration = Date.now();

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchNumber = i + 1;
      const progress = ((batchNumber / batches.length) * 100).toFixed(1);

      process.stdout.write(`📦 Batch ${batchNumber}/${batches.length} (${progress}%): Processing ${batch.length} records... `);

      if (DRY_RUN) {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 100));
        totalInserted += batch.length;
        console.log(`✅ [DRY RUN] Would insert ${batch.length} records`);
      } else {
        try {
          // Build INSERT query with ON CONFLICT to skip duplicates
          // Include 'id' to preserve record IDs from source
          const columns = Object.keys(batch[0]);

          // Remap project IDs and prepare values
          const values = batch.flatMap(record => {
            return columns.map(col => {
              // Remap projectId to target database
              if (col === 'projectId') {
                const targetProjectId = projectMapping.get(record[col]);
                return targetProjectId || null;
              }

              const value = record[col];

              // Handle JSONB metadata column
              if (col === 'metadata') {
                if (value === null || value === undefined) {
                  return null;
                }
                if (typeof value === 'object') {
                  return JSON.stringify(value);
                }
                if (typeof value === 'string') {
                  try {
                    JSON.parse(value);
                    return value;
                  } catch {
                    return null;
                  }
                }
                return null;
              }

              // Handle vector column (pass through as-is)
              if (col === 'contentVector') {
                return value;
              }

              return value;
            });
          });

          const placeholders = batch.map((_, idx) => {
            const start = idx * columns.length + 1;
            return `(${columns.map((_, colIdx) => `$${start + colIdx}`).join(', ')})`;
          }).join(', ');

          const insertQuery = `
            INSERT INTO data_records (${columns.map(c => `"${c}"`).join(', ')})
            VALUES ${placeholders}
            ON CONFLICT (id) DO NOTHING
          `;

          const result = await targetClient.query(insertQuery, values);
          const inserted = result.rowCount || 0;
          const skipped = batch.length - inserted;

          totalInserted += inserted;
          totalSkipped += skipped;

          console.log(`✅ Inserted ${inserted}, Skipped ${skipped} duplicates`);
        } catch (error) {
          totalErrors += batch.length;
          console.log(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          console.log('   ⚠️  Continuing with next batch...');
        }
      }
    }

    const totalTime = ((Date.now() - startMigration) / 1000).toFixed(2);
    const recordsPerSecond = totalInserted > 0 ? (totalInserted / parseFloat(totalTime)).toFixed(0) : '0';

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Migration Complete');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`✅ Successfully inserted:  ${totalInserted.toLocaleString()} records`);
    console.log(`⏭️  Skipped (duplicates):   ${totalSkipped.toLocaleString()} records`);
    console.log(`❌ Errors:                 ${totalErrors.toLocaleString()} records`);
    console.log(`⏱️  Total time:             ${totalTime}s (${recordsPerSecond} records/sec)`);
    console.log('');

    if (DRY_RUN) {
      console.log('🧪 This was a DRY RUN - no data was actually written');
      console.log('   To perform the actual migration, run without DRY_RUN=true');
    } else {
      // Verify counts
      const finalCountResult = await targetClient.query(
        'SELECT COUNT(*) FROM data_records'
      );
      const finalTargetCount = parseInt(finalCountResult.rows[0].count);
      console.log(`📊 Final target database count: ${finalTargetCount.toLocaleString()} records`);
      console.log(`   (Was ${targetCount.toLocaleString()}, added ${totalInserted.toLocaleString()})`);
    }

    console.log('');
    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('  Migration Failed');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('');
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    console.error('');
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    // Cleanup
    await sourceClient.end();
    await targetClient.end();
  }
}

// ============================================================================
// Main Execution
// ============================================================================

migrateDataRecords()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
