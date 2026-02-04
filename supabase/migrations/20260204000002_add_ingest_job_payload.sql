-- Add payload and options columns to store ingestion data in database instead of memory
-- This allows serverless functions to retrieve the data across invocations
--
-- SECURITY NOTE: payload may contain PII from CSV uploads. It is cleared after job completion.

ALTER TABLE public.ingest_jobs
ADD COLUMN IF NOT EXISTS payload TEXT,
ADD COLUMN IF NOT EXISTS options JSONB;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status
ON public.ingest_jobs(status, "createdAt");
