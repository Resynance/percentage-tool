-- ============================================================================
-- Fix Stuck Vectorizing/Ingestion Job
-- ============================================================================
-- Use this after a server crash to recover stuck ingestion jobs

-- 1. Check current status of stuck jobs
SELECT
  id,
  status,
  "projectId",
  type,
  "totalRecords",
  "savedCount",
  "skippedCount",
  error,
  "createdAt",
  "updatedAt",
  EXTRACT(EPOCH FROM (NOW() - "updatedAt"))/60 as minutes_since_update
FROM ingest_jobs
WHERE status IN ('PROCESSING', 'VECTORIZING', 'PENDING')
  AND "updatedAt" < NOW() - INTERVAL '5 minutes'
ORDER BY "updatedAt" DESC;

-- 2. Mark stuck jobs as FAILED (jobs that haven't updated in 10+ minutes)
UPDATE ingest_jobs
SET
  status = 'FAILED',
  error = 'Job killed by server crash - cleaned up manually',
  "updatedAt" = NOW()
WHERE status IN ('PROCESSING', 'VECTORIZING')
  AND "updatedAt" < NOW() - INTERVAL '10 minutes'
RETURNING id, status, "projectId", type;

-- 3. Verify fix - should show no stuck jobs
SELECT
  id,
  status,
  "projectId",
  type,
  "totalRecords",
  "savedCount",
  "skippedCount"
FROM ingest_jobs
WHERE status IN ('PROCESSING', 'VECTORIZING')
ORDER BY "updatedAt" DESC;

-- 4. Check all jobs status distribution
SELECT
  status,
  COUNT(*) as count
FROM ingest_jobs
GROUP BY status
ORDER BY count DESC;

-- 5. Check records without embeddings (if you need to reprocess)
SELECT
  p.name as project_name,
  dr.type,
  COUNT(*) as records_without_embeddings
FROM data_records dr
JOIN projects p ON dr."projectId" = p.id
WHERE dr.embedding IS NULL
GROUP BY p.name, dr.type
ORDER BY records_without_embeddings DESC;
