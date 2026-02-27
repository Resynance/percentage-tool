# Prompt Authenticity Records Migration Script

This script safely migrates prompt authenticity records from one database to another (e.g., local to production).

## Features

- ✅ **Batch processing** (500 records at a time)
- ✅ **Duplicate handling** (automatically skips existing records)
- ✅ **Progress logging** (real-time feedback)
- ✅ **Dry run mode** (test before actual migration)
- ✅ **Error recovery** (continues on batch errors)
- ✅ **Connection masking** (safe logging of connection strings)
- ✅ **Confirmation prompt** (prevents accidents)

## Prerequisites

1. **Install tsx** (if not already installed):
   ```bash
   npm install -g tsx
   ```

2. **Get database connection strings**:
   - Source database URL (where records currently are)
   - Target database URL (where records should go)

## Usage

### Option 1: Environment Variables (Recommended)

```bash
SOURCE_DATABASE_URL="postgresql://user:pass@localhost:54322/postgres" \
TARGET_DATABASE_URL="postgresql://user:pass@prod-host/prod-db" \
tsx scripts/migrate-prompt-authenticity-to-prod.ts
```

### Option 2: Create .env file

Create `.env.migration` in the root directory:

```env
SOURCE_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
TARGET_DATABASE_URL=postgresql://user:password@prod-host.supabase.co:5432/postgres
```

Then load it and run:

```bash
export $(cat .env.migration | xargs) && tsx scripts/migrate-prompt-authenticity-to-prod.ts
```

### Option 3: Dry Run (Safe Testing)

Test the migration without writing any data:

```bash
SOURCE_DATABASE_URL="postgresql://..." \
TARGET_DATABASE_URL="postgresql://..." \
DRY_RUN=true \
tsx scripts/migrate-prompt-authenticity-to-prod.ts
```

## Example Output

```
═══════════════════════════════════════════════════════════════
  Prompt Authenticity Records Migration
═══════════════════════════════════════════════════════════════

📤 Source:      postgresql://***:***@localhost:54322/postgres
📥 Target:      postgresql://***:***@prod-host.supabase.co:5432/postgres
📦 Batch size:  500 records
🧪 Dry run:     NO (will write to target)

🔌 Testing database connections...
✅ Connected to both databases

📊 Analyzing source database...
   Found 1,548 records in source database

📊 Analyzing target database...
   Found 0 existing records in target database

📋 Sample records to migrate:
   1. version-123 - task-abc
      Author: John Doe (john@example.com)
      Status: COMPLETED, Created: 2024-02-25T10:30:00.000Z
   2. version-124 - task-def
      Author: Jane Smith (jane@example.com)
      Status: PENDING, Created: 2024-02-25T10:31:00.000Z

⚠️  WARNING: This will INSERT records into the PRODUCTION database!
⚠️  Duplicate records will be skipped (based on versionId unique constraint)

❓ Are you sure you want to continue? (y/N): y

📤 Fetching all records from source database...
✅ Fetched 1,548 records in 0.87s

📦 Split into 4 batches of 500 records each

📦 Batch 1/4 (25.0%): Processing 500 records... ✅ Inserted 500, Skipped 0 duplicates
📦 Batch 2/4 (50.0%): Processing 500 records... ✅ Inserted 500, Skipped 0 duplicates
📦 Batch 3/4 (75.0%): Processing 500 records... ✅ Inserted 500, Skipped 0 duplicates
📦 Batch 4/4 (100.0%): Processing 48 records... ✅ Inserted 48, Skipped 0 duplicates

═══════════════════════════════════════════════════════════════
  Migration Complete
═══════════════════════════════════════════════════════════════

✅ Successfully inserted:  1,548 records
⏭️  Skipped (duplicates):   0 records
❌ Errors:                 0 records
⏱️  Total time:             2.34s (661 records/sec)

📊 Final target database count: 1,548 records
   (Was 0, added 1,548)

🎉 Migration completed successfully!
```

## How It Works

1. **Connects** to both source and target databases
2. **Counts** records in both databases
3. **Shows sample** of what will be migrated
4. **Asks for confirmation** (unless dry run)
5. **Fetches all records** from source
6. **Splits into batches** of 500 records
7. **Inserts each batch** with `skipDuplicates: true`
8. **Logs progress** for each batch
9. **Continues on errors** (doesn't fail entire migration)
10. **Verifies final count** in target database

## Safety Features

### Duplicate Handling
The script uses Prisma's `skipDuplicates: true`, which skips records with existing `versionId` (unique constraint). This means:
- ✅ Safe to run multiple times
- ✅ Won't fail on existing records
- ✅ Only inserts new records

### Error Recovery
If a batch fails:
- ❌ That batch's records are marked as errors
- ✅ Migration continues with next batch
- ✅ Other batches are not affected

### Connection String Masking
Connection strings are masked in logs:
```
postgresql://user:pass@host/db → postgresql://***:***@host/db
```

## Troubleshooting

### Error: "SOURCE_DATABASE_URL environment variable is required"
**Solution**: Set the environment variable before running:
```bash
export SOURCE_DATABASE_URL="postgresql://..."
```

### Error: "Cannot connect to database"
**Solution**: Verify connection string and network access:
```bash
# Test source connection
psql "$SOURCE_DATABASE_URL" -c "SELECT 1"

# Test target connection
psql "$TARGET_DATABASE_URL" -c "SELECT 1"
```

### Error: "Duplicate key violation"
**Solution**: This shouldn't happen with `skipDuplicates: true`, but if it does:
1. Check if versionId unique constraint exists on target
2. Manually remove duplicate records from source before migrating

### Migration is slow
**Solution**: Adjust batch size (larger = faster but more memory):
```typescript
// In script, change line:
const BATCH_SIZE = 1000; // Was 500
```

### Need to migrate only specific records
**Solution**: Modify the `allRecords` query in the script:
```typescript
// Example: Only migrate COMPLETED records
const allRecords = await sourcePrisma.promptAuthenticityRecord.findMany({
  where: { analysisStatus: 'COMPLETED' },
  orderBy: { createdAt: 'asc' }
});
```

## Getting Connection Strings

### Local Supabase
```bash
# Default local connection
postgresql://postgres:postgres@localhost:54322/postgres
```

### Production Supabase
1. Go to Supabase Dashboard
2. Project Settings → Database
3. Copy "Connection string" under "Connection pooling"
4. Replace `[YOUR-PASSWORD]` with actual password

**Example**:
```
postgresql://postgres.abc123xyz:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

## Post-Migration Verification

After successful migration, verify the data:

```sql
-- Count records
SELECT COUNT(*) FROM prompt_authenticity_records;

-- Check analysis statuses
SELECT analysis_status, COUNT(*)
FROM prompt_authenticity_records
GROUP BY analysis_status;

-- Verify recent records
SELECT version_id, task_key, created_by_name, analysis_status, created_at
FROM prompt_authenticity_records
ORDER BY created_at DESC
LIMIT 10;

-- Check for duplicates (should be 0)
SELECT version_id, COUNT(*)
FROM prompt_authenticity_records
GROUP BY version_id
HAVING COUNT(*) > 1;
```

## Security Notes

⚠️ **Never commit connection strings to git!**

- Use environment variables
- Add `.env.migration` to `.gitignore`
- Rotate passwords after migration
- Use read-only source credentials if possible

## Alternative: Manual Export/Import

If the script doesn't work, you can manually export/import:

### Export from source:
```bash
psql "$SOURCE_DATABASE_URL" -c "COPY prompt_authenticity_records TO STDOUT WITH CSV HEADER" > records.csv
```

### Import to target:
```bash
psql "$TARGET_DATABASE_URL" -c "COPY prompt_authenticity_records FROM STDIN WITH CSV HEADER" < records.csv
```

**Note**: This won't handle duplicates automatically like the script does.

## Support

If you encounter issues:
1. Check the error message carefully
2. Run with `DRY_RUN=true` to test without writing
3. Verify database connections with `psql`
4. Check Supabase logs for constraint violations
5. Reach out for help with the error details
