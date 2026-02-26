#!/usr/bin/env tsx
/**
 * Migration Script: Move Prompt Authenticity Records to Production
 *
 * This script copies all prompt authenticity records from a source database
 * to a production database in batches with progress logging.
 *
 * Usage:
 *   SOURCE_DATABASE_URL="postgresql://..." TARGET_DATABASE_URL="postgresql://..." tsx scripts/migrate-prompt-authenticity-to-prod.ts
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
  console.error('Example: SOURCE_DATABASE_URL="postgresql://localhost:54322/postgres" tsx scripts/migrate-prompt-authenticity-to-prod.ts');
  process.exit(1);
}

if (!TARGET_DATABASE_URL) {
  console.error('❌ TARGET_DATABASE_URL environment variable is required');
  console.error('Example: TARGET_DATABASE_URL="postgresql://prod-host/prod-db" tsx scripts/migrate-prompt-authenticity-to-prod.ts');
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

async function migratePromptAuthenticityRecords() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Prompt Authenticity Records Migration');
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

    // Count records in source
    console.log('📊 Analyzing source database...');
    const sourceCountResult = await sourceClient.query(
      'SELECT COUNT(*) FROM prompt_authenticity_records'
    );
    const sourceCount = parseInt(sourceCountResult.rows[0].count);
    console.log(`   Found ${sourceCount.toLocaleString()} records in source database`);

    if (sourceCount === 0) {
      console.log('⚠️  No records to migrate. Exiting.');
      return;
    }

    // Count existing records in target
    console.log('📊 Analyzing target database...');

    // Enhanced debugging: Check what schemas and tables exist
    console.log('🔍 Debugging: Checking database structure...');

    // Check all schemas
    const schemasResult = await targetClient.query(`
      SELECT schema_name
      FROM information_schema.schemata
      ORDER BY schema_name
    `);
    console.log(`   Schemas found: ${schemasResult.rows.map(r => r.schema_name).join(', ')}`);

    // Check all tables (no schema filter)
    const allTablesResult = await targetClient.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    console.log(`   Total tables found: ${allTablesResult.rows.length}`);
    console.log('');
    console.log('   All tables in database:');
    allTablesResult.rows.forEach(row => {
      console.log(`     - ${row.table_schema}.${row.table_name}`);
    });
    console.log('');

    // Try multiple variations to find the table
    console.log('🔍 Searching for prompt_authenticity tables...');

    // Variation 1: Case-insensitive ILIKE
    const tableCheckResult1 = await targetClient.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name ILIKE '%prompt%authenticity%'
    `);
    console.log(`   Found ${tableCheckResult1.rows.length} tables with ILIKE '%prompt%authenticity%'`);

    // Variation 2: Exact match on expected name
    const tableCheckResult2 = await targetClient.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name = 'prompt_authenticity_records'
    `);
    console.log(`   Found ${tableCheckResult2.rows.length} tables with exact name 'prompt_authenticity_records'`);

    // Variation 3: Try direct query to see if table is accessible
    let directQueryWorks = false;
    try {
      await targetClient.query('SELECT COUNT(*) FROM prompt_authenticity_records LIMIT 1');
      directQueryWorks = true;
      console.log('   ✅ Direct query to prompt_authenticity_records works!');
    } catch (e) {
      console.log(`   ❌ Direct query failed: ${e instanceof Error ? e.message : e}`);
    }
    console.log('');

    // Use whichever method found the table
    let tableCheckResult = tableCheckResult1.rows.length > 0 ? tableCheckResult1 : tableCheckResult2;

    // Determine table name and schema
    let tableName: string;
    let tableSchema: string;
    let fullTableName: string;

    // If direct query works but information_schema doesn't find it, use the direct approach
    if (directQueryWorks && tableCheckResult.rows.length === 0) {
      console.log('⚠️  Table exists but not visible in information_schema');
      console.log('   Proceeding with direct table name: prompt_authenticity_records');
      console.log('');

      // Assume public schema
      tableName = 'prompt_authenticity_records';
      tableSchema = 'public';
      fullTableName = `${tableSchema}.${tableName}`;
      console.log(`   Using table: ${fullTableName}`);
    } else if (tableCheckResult.rows.length === 0) {
      console.error('❌ Could not find prompt_authenticity table in target database');
      console.error('   Neither information_schema queries nor direct access worked');
      throw new Error('Table prompt_authenticity_records does not exist in target database');
    } else {
      tableName = tableCheckResult.rows[0].table_name;
      tableSchema = tableCheckResult.rows[0].table_schema;
      fullTableName = `${tableSchema}.${tableName}`;
      console.log(`   Found table: ${fullTableName}`);
    }

    const targetCountResult = await targetClient.query(
      `SELECT COUNT(*) FROM ${fullTableName}`
    );
    const targetCount = parseInt(targetCountResult.rows[0].count);
    console.log(`   Found ${targetCount.toLocaleString()} existing records in target database`);
    console.log('');

    // Get sample of what will be migrated
    const sampleResult = await sourceClient.query(
      'SELECT version_id, task_key, created_by_name, created_by_email, analysis_status, created_at FROM prompt_authenticity_records ORDER BY created_at DESC LIMIT 3'
    );

    console.log('📋 Sample records to migrate:');
    sampleResult.rows.forEach((record, i) => {
      console.log(`   ${i + 1}. ${record.version_id} - ${record.task_key || 'No task key'}`);
      console.log(`      Author: ${record.created_by_name || 'Unknown'} (${record.created_by_email || 'No email'})`);
      console.log(`      Status: ${record.analysis_status}, Created: ${record.created_at}`);
    });
    console.log('');

    // Confirmation
    if (!DRY_RUN) {
      console.log('⚠️  WARNING: This will INSERT records into the PRODUCTION database!');
      console.log('⚠️  Duplicate records will be skipped (based on version_id unique constraint)');
      console.log('');

      const confirmed = await askConfirmation('❓ Are you sure you want to continue? (y/N): ');

      if (!confirmed) {
        console.log('❌ Migration cancelled by user');
        return;
      }
      console.log('');
    }

    // Fetch all records from source
    console.log('📤 Fetching all records from source database...');
    const startFetch = Date.now();
    const allRecordsResult = await sourceClient.query(
      'SELECT * FROM prompt_authenticity_records ORDER BY created_at ASC'
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
          const columns = Object.keys(batch[0]).filter(k => k !== 'id');
          const placeholders = batch.map((_, idx) => {
            const start = idx * columns.length + 1;
            return `(${columns.map((_, colIdx) => `$${start + colIdx}`).join(', ')})`;
          }).join(', ');

          // JSONB columns that need special handling
          const jsonbColumns = ['non_native_indicators', 'ai_generated_indicators', 'recommendations'];

          const values = batch.flatMap(record =>
            columns.map(col => {
              const value = record[col];

              // Handle JSONB columns
              if (jsonbColumns.includes(col)) {
                if (value === null || value === undefined) {
                  return null;
                }
                // If it's already an object, stringify it
                if (typeof value === 'object') {
                  return JSON.stringify(value);
                }
                // If it's a string, try to parse and re-stringify to validate
                if (typeof value === 'string') {
                  try {
                    JSON.parse(value); // Validate it's valid JSON
                    return value; // Already a JSON string
                  } catch {
                    return null; // Invalid JSON, set to null
                  }
                }
                return null;
              }

              return value;
            })
          );

          const insertQuery = `
            INSERT INTO prompt_authenticity_records (${columns.join(', ')})
            VALUES ${placeholders}
            ON CONFLICT (version_id) DO NOTHING
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
    const recordsPerSecond = (totalInserted / parseFloat(totalTime)).toFixed(0);

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
        'SELECT COUNT(*) FROM prompt_authenticity_records'
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

migratePromptAuthenticityRecords()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
