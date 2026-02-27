# Data Records Migration Guide

Migrate `data_records` from local/staging to production with automatic project key matching.

## Key Features

- ✅ **Project key matching** - Automatically maps projects by name between source and target
- ✅ **Skips unmatched projects** - Records from projects that don't exist in target are skipped
- ✅ **Batch processing** - 500 records at a time
- ✅ **Duplicate handling** - Automatically skips existing records
- ✅ **Vector embeddings** - Preserves contentVector data
- ✅ **JSONB metadata** - Properly handles metadata field
- ✅ **Dry run mode** - Test before actual migration
- ✅ **Progress logging** - Real-time feedback

## Quick Start

### 1. Dry Run (Safe)

Test the migration without writing data:

```bash
SOURCE_DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" \
TARGET_DATABASE_URL="postgresql://postgres.PROJECT:[PASSWORD]@aws-region.pooler.supabase.com:6543/postgres" \
DRY_RUN=true \
tsx scripts/migrate-data-records-to-prod.ts
```

### 2. Actual Migration

After verifying dry run output:

```bash
SOURCE_DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" \
TARGET_DATABASE_URL="postgresql://postgres.PROJECT:[PASSWORD]@aws-region.pooler.supabase.com:6543/postgres" \
tsx scripts/migrate-data-records-to-prod.ts
```

## How Project Matching Works

The script matches projects by **name** between source and target databases:

### Example Output:

```
📊 Building project key mapping...
   ✅ Project Alpha: abc123... → def456...
   ✅ Project Beta: xyz789... → uvw012...
   ❌ Project Gamma: No matching project in target

📊 Project mapping: 2 matched, 1 unmatched
⚠️  WARNING: Records from unmatched projects will be skipped:
   - Project Gamma
```

### What Gets Migrated:

- ✅ Records from "Project Alpha" (IDs remapped: abc123... → def456...)
- ✅ Records from "Project Beta" (IDs remapped: xyz789... → uvw012...)
- ❌ Records from "Project Gamma" (skipped - no matching project in target)

## Expected Output

```
═══════════════════════════════════════════════════════════════
  Data Records Migration
═══════════════════════════════════════════════════════════════

📤 Source:      postgresql://***:***@localhost:54322/postgres
📥 Target:      postgresql://***:***@aws-region.pooler.supabase.com:6543/postgres
📦 Batch size:  500 records

🔌 Testing database connections...
✅ Connected to both databases

📊 Building project key mapping...
   ✅ Project A: source-id-1 → target-id-1
   ✅ Project B: source-id-2 → target-id-2

📊 Project mapping: 2 matched, 0 unmatched

📊 Analyzing source database...
   Found 10,000 total records in source database
   Found 10,000 records in matched projects (will migrate)
   Found 0 records in unmatched projects (will skip)

📊 Analyzing target database...
   Found 0 existing records in target database

📋 Sample records to migrate:
   1. TASK - Write a function that calculates...
      Project: source-id-1 → target-id-1
      Author: user@example.com, Created: 2026-02-25
   2. FEEDBACK - Good work on this task...
      Project: source-id-2 → target-id-2
      Author: reviewer@example.com, Created: 2026-02-25

⚠️  WARNING: This will INSERT records into PRODUCTION!
⚠️  Project IDs will be remapped to match target database
❓ Are you sure? (y/N): y

📤 Fetching all records from source database...
✅ Fetched 10,000 records in 1.23s

📦 Split into 20 batches of 500 records each

📦 Batch 1/20 (5.0%): Processing 500 records... ✅ Inserted 500, Skipped 0 duplicates
📦 Batch 2/20 (10.0%): Processing 500 records... ✅ Inserted 500, Skipped 0 duplicates
...
📦 Batch 20/20 (100.0%): Processing 500 records... ✅ Inserted 500, Skipped 0 duplicates

═══════════════════════════════════════════════════════════════
  Migration Complete
═══════════════════════════════════════════════════════════════

✅ Successfully inserted:  10,000 records
⏭️  Skipped (duplicates):   0 records
❌ Errors:                 0 records
⏱️  Total time:             12.34s (810 records/sec)

📊 Final target database count: 10,000 records
   (Was 0, added 10,000)

🎉 Migration completed successfully!
```

## Before You Migrate

### 1. Ensure Projects Exist in Target

The script matches projects by **name**. Make sure all projects you want to migrate exist in the target database with the same name:

```sql
-- Check projects in source
SELECT id, name FROM projects ORDER BY name;

-- Check projects in target
SELECT id, name FROM projects ORDER BY name;
```

### 2. Create Missing Projects

If projects are missing in target, create them:

```sql
-- In target database
INSERT INTO projects (id, name, "ownerId", guidelines, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Project Name',
  'owner-user-id',
  'Guidelines here',
  NOW(),
  NOW()
);
```

### 3. Check Record Count

Verify how many records will be migrated:

```sql
-- In source database
SELECT p.name, COUNT(*) as record_count
FROM data_records dr
JOIN projects p ON dr."projectId" = p.id
GROUP BY p.name
ORDER BY record_count DESC;
```

## Troubleshooting

### "No matching project in target"

**Solution**: Create the missing project in the target database with the same name.

### "Error: invalid input syntax for type json"

**Solution**: The metadata field contains invalid JSON. The script attempts to fix this automatically, but you may need to clean up source data.

### "Error: duplicate key value violates unique constraint"

**Solution**: This shouldn't happen due to `ON CONFLICT DO NOTHING`, but if it does, the record already exists in target. Safe to skip.

### Migration is slow

**Solution**: Increase batch size (edit BATCH_SIZE in script). Default is 500, try 1000 or 2000 for faster migration.

### Need to filter by specific projects

**Solution**: Modify the script's fetch query to filter by specific project names:

```typescript
// In migrateDataRecords function, around line 180
const allRecordsResult = await sourceClient.query(
  `SELECT dr.* FROM data_records dr
   JOIN projects p ON dr."projectId" = p.id
   WHERE "projectId" = ANY($1::uuid[])
   AND p.name IN ('Project A', 'Project B')  -- Add this filter
   ORDER BY "createdAt" ASC`,
  [matchedProjectIds]
);
```

## Post-Migration Verification

After successful migration, verify the data:

```sql
-- Count records
SELECT COUNT(*) FROM data_records;

-- Check distribution by type
SELECT type, COUNT(*)
FROM data_records
GROUP BY type;

-- Verify project assignments
SELECT p.name, COUNT(*) as record_count
FROM data_records dr
JOIN projects p ON dr."projectId" = p.id
GROUP BY p.name
ORDER BY record_count DESC;

-- Check for records with null content vectors (if using embeddings)
SELECT COUNT(*)
FROM data_records
WHERE "contentVector" IS NULL;

-- Verify recent records
SELECT id, type, LEFT(content, 50) as content_preview, "createdByEmail", "createdAt"
FROM data_records
ORDER BY "createdAt" DESC
LIMIT 10;
```

## Security Notes

⚠️ **Never commit connection strings to git!**

- Use environment variables
- Rotate passwords after migration
- Use read-only source credentials if possible

## Alternative: Manual Export/Import

If the script doesn't work, you can manually export/import:

### Export from source:

```bash
psql "$SOURCE_DATABASE_URL" -c "COPY (SELECT * FROM data_records WHERE \"projectId\" IN ('project-id-1', 'project-id-2')) TO STDOUT WITH CSV HEADER" > records.csv
```

### Import to target (with project ID remapping):

You'll need to manually remap project IDs in the CSV before importing.

## Support

If you encounter issues:
1. Run with `DRY_RUN=true` first to test
2. Check project name matching in the output
3. Verify database connections work
4. Check for error messages in batch processing
5. Reach out with error details if needed
