# Optimizing Data Records Metadata Queries

## Problem

The current query extracting multiple JSONB paths with OR conditions is slow:

```sql
WHERE (
  metadata #> array[$1]::text[] = $2
  OR metadata #> array[$3]::text[] = $4
  OR metadata #> array[$5]::text[] = $6
  OR metadata #> array[$7]::text[] = $8
)
```

## Solutions

### 1. Apply Database Indexes (Immediate - Do This First)

Run the migration:
```bash
npm run dev:reset  # For local
# For production: Apply via Supabase Dashboard or CLI
```

This adds:
- **GIN index** on metadata (speeds up all JSONB queries)
- **Composite index** on (projectId, type)
- **Expression indexes** for specific metadata fields (optional)

**Expected improvement**: 10-50x faster queries

### 2. Rewrite Query Using JSONB Containment (Faster)

If you're checking if metadata contains specific values, use `@>` operator instead:

**Before (slow):**
```sql
WHERE (
  metadata #> '{field1}' = '"value1"'
  OR metadata #> '{field2}' = '"value2"'
)
```

**After (fast with GIN index):**
```sql
WHERE metadata @> '{"field1": "value1"}'
   OR metadata @> '{"field2": "value2"}'
```

### 3. Denormalize Frequently Queried Fields

If certain metadata fields are queried constantly, move them to regular columns:

```sql
-- Add new columns for commonly queried metadata
ALTER TABLE data_records
ADD COLUMN environment_name TEXT GENERATED ALWAYS AS (metadata->>'environment_name') STORED,
ADD COLUMN task_key TEXT GENERATED ALWAYS AS (metadata->>'task_key') STORED;

-- Index them
CREATE INDEX idx_data_records_environment ON data_records(environment_name);
CREATE INDEX idx_data_records_task_key ON data_records(task_key);
```

**Pros**: 5-10x faster than JSONB queries
**Cons**: Duplicates data, increases storage slightly

### 4. Batch the OR Conditions

Instead of 4 separate OR conditions, collect values and use `IN`:

**Before:**
```typescript
where: {
  projectId,
  type,
  OR: [
    { metadata: { path: ['field1'], equals: 'value1' } },
    { metadata: { path: ['field2'], equals: 'value2' } },
    { metadata: { path: ['field3'], equals: 'value3' } },
    { metadata: { path: ['field4'], equals: 'value4' } },
  ]
}
```

**After (if fields are the same):**
```typescript
// If checking same field for multiple values
where: {
  projectId,
  type,
  metadata: {
    path: ['field'],
    in: ['value1', 'value2', 'value3', 'value4']
  }
}
```

### 5. Use Prisma's Raw Query with Better Syntax

**Current query has redundant casts:**
```sql
(metadata #> array[$1]::text[])::jsonb::jsonb = $2
```

**Optimized (remove double ::jsonb cast):**
```sql
(metadata #> array[$1]::text[])::jsonb = $2
```

Or better yet, use the `->>` operator for text comparison:
```sql
metadata->>'field' = 'value'  -- Returns text, faster than JSONB comparison
```

### 6. Identify Which Metadata Fields Are Being Queried

To provide more specific optimization, please share:

1. What are the metadata field names being queried? (the `$1, $3, $5, $7` values)
2. How often is this query run?
3. What's the current average query time?

Common metadata fields to consider denormalizing:
- `environment_name` / `env_key`
- `task_key`
- `status` / `task_lifecycle_status`
- `task_modality`
- `author_*` fields

### 7. Check Current Query Plan

Run this to see what's happening:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM data_records
WHERE projectId = 'your-project-id'
  AND type = 'TASK'
  AND (
    metadata #> '{field1}' = '"value1"'
    OR metadata #> '{field2}' = '"value2"'
  )
LIMIT 25;
```

Look for:
- ❌ `Seq Scan` - Bad, means no index used
- ✅ `Index Scan` or `Bitmap Index Scan` - Good, using indexes
- ❌ High `cost` numbers (> 10000) - Slow query

## Quick Wins Checklist

- [ ] Apply the index migration
- [ ] Remove redundant `::jsonb::jsonb` double cast
- [ ] Use `@>` operator instead of `#>` when possible
- [ ] Consider denormalizing top 3-5 most-queried metadata fields
- [ ] Run `ANALYZE data_records` after index creation
- [ ] Check query plan with `EXPLAIN ANALYZE`

## Expected Results

After applying indexes:
- **Before**: 500-2000ms for large tables
- **After**: 10-50ms for same query

After denormalizing frequently queried fields:
- **Before**: 10-50ms with JSONB + GIN index
- **After**: 1-5ms with regular column indexes

## Need Help?

Share:
1. Output of `EXPLAIN ANALYZE` for your slow query
2. The actual metadata field names being queried
3. Table size: `SELECT COUNT(*) FROM data_records`
4. Current query time

And I can provide more specific optimization recommendations!
