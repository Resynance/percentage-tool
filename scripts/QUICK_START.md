# Quick Start: Migrate Prompt Authenticity Records

## 🚀 Fast Track (3 steps)

### 1. Install tsx
```bash
npm install -g tsx
```

### 2. Set environment variables
```bash
export SOURCE_DATABASE_URL="postgresql://user:pass@localhost:54322/postgres"
export TARGET_DATABASE_URL="postgresql://user:pass@prod-host/prod-db"
```

### 3. Run migration
```bash
# Dry run first (safe - no writes)
DRY_RUN=true tsx scripts/migrate-prompt-authenticity-to-prod.ts

# Actual migration (after verifying dry run)
tsx scripts/migrate-prompt-authenticity-to-prod.ts
```

---

## 📋 Copy-Paste Commands

### Local → Production (Supabase)
```bash
# Get your prod connection string from Supabase Dashboard → Settings → Database

SOURCE_DATABASE_URL="postgresql://postgres:postgres@localhost:54322/postgres" \
TARGET_DATABASE_URL="postgresql://postgres.YOUR_PROJECT:[YOUR_PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres" \
tsx scripts/migrate-prompt-authenticity-to-prod.ts
```

### With .env file
```bash
# Create .env.migration file with your connection strings
cat > .env.migration << 'EOF'
SOURCE_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
TARGET_DATABASE_URL=postgresql://prod-connection-string-here
EOF

# Load and run
export $(cat .env.migration | xargs) && tsx scripts/migrate-prompt-authenticity-to-prod.ts
```

---

## ✅ What to Expect

```
📤 Source:      postgresql://***:***@localhost:54322/postgres
📥 Target:      postgresql://***:***@prod-host/db
📦 Batch size:  500 records

🔌 Testing database connections...
✅ Connected to both databases

📊 Found 1,548 records in source database
📊 Found 0 existing records in target database

⚠️  WARNING: This will INSERT records into PRODUCTION!
❓ Are you sure? (y/N): y

📦 Batch 1/4 (25%): ✅ Inserted 500
📦 Batch 2/4 (50%): ✅ Inserted 500
📦 Batch 3/4 (75%): ✅ Inserted 500
📦 Batch 4/4 (100%): ✅ Inserted 48

✅ Successfully inserted: 1,548 records
⏱️  Total time: 2.34s
🎉 Migration completed!
```

---

## 🛡️ Safety Features

- ✅ **Dry run mode** - Test before real migration
- ✅ **Duplicate handling** - Skips existing records automatically
- ✅ **Confirmation prompt** - Asks before writing to production
- ✅ **Batch processing** - Doesn't load all data into memory
- ✅ **Error recovery** - Continues on batch failures
- ✅ **Progress logging** - Real-time feedback

---

## 🆘 Troubleshooting

**Can't connect to database?**
```bash
# Test connection
psql "$SOURCE_DATABASE_URL" -c "SELECT 1"
```

**Script not found?**
```bash
# Make sure you're in the repo root
cd /path/to/operations-toolkit
```

**tsx not installed?**
```bash
npm install -g tsx
```

**Need to rollback?**
```bash
# If you need to remove migrated records (CAREFUL!)
psql "$TARGET_DATABASE_URL" << 'EOF'
DELETE FROM prompt_authenticity_records
WHERE version_id IN (
  -- List of version IDs you want to remove
  'version-123', 'version-124'
);
EOF
```

---

## 📊 Verify Migration

```sql
-- Count records
SELECT COUNT(*) FROM prompt_authenticity_records;

-- Check statuses
SELECT analysis_status, COUNT(*)
FROM prompt_authenticity_records
GROUP BY analysis_status;

-- Recent records
SELECT version_id, created_by_name, created_at
FROM prompt_authenticity_records
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🔗 Full Documentation

See `MIGRATION_README.md` for detailed information about:
- How it works
- Safety features
- Error handling
- Getting connection strings
- Manual export/import alternative
