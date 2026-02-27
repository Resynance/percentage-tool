-- ============================================================================
-- Optimize Data Records Metadata Queries
-- ============================================================================
-- This migration adds indexes to speed up JSONB metadata queries

-- 1. Add GIN index on entire metadata column (for general JSONB queries)
CREATE INDEX IF NOT EXISTS idx_data_records_metadata_gin
ON public.data_records USING gin (metadata jsonb_path_ops);

-- 2. Add composite index for common query pattern (projectId + type)
CREATE INDEX IF NOT EXISTS idx_data_records_project_type
ON public.data_records ("projectId", type)
WHERE metadata IS NOT NULL;

-- 3. Add expression indexes for specific metadata paths (if you know the common paths)
-- Replace 'environment_name' with your actual common metadata keys
-- Uncomment and customize these based on your actual metadata structure:

-- CREATE INDEX IF NOT EXISTS idx_data_records_metadata_env
-- ON public.data_records ((metadata->>'environment_name'))
-- WHERE metadata->>'environment_name' IS NOT NULL;

-- CREATE INDEX IF NOT EXISTS idx_data_records_metadata_task_key
-- ON public.data_records ((metadata->>'task_key'))
-- WHERE metadata->>'task_key' IS NOT NULL;

-- CREATE INDEX IF NOT EXISTS idx_data_records_metadata_status
-- ON public.data_records ((metadata->>'status'))
-- WHERE metadata->>'status' IS NOT NULL;

-- 4. Analyze table to update statistics
ANALYZE public.data_records;

-- ============================================================================
-- Usage Notes
-- ============================================================================
-- After applying this migration:
--
-- 1. The GIN index will speed up all JSONB queries using operators like:
--    - @> (contains)
--    - ? (key exists)
--    - #> (path extraction)
--
-- 2. The composite index speeds up queries filtering by projectId + type
--
-- 3. Expression indexes (if uncommented) speed up specific metadata field queries
--
-- 4. To check index usage:
--    EXPLAIN ANALYZE SELECT ... FROM data_records WHERE ...;
--
-- 5. To check index sizes:
--    SELECT
--      indexname,
--      pg_size_pretty(pg_relation_size(indexrelid::regclass)) as size
--    FROM pg_indexes
--    WHERE tablename = 'data_records';
