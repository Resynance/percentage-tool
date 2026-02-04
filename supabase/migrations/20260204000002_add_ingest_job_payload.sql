-- Add payload column to store CSV/API data in database instead of memory
-- This allows serverless functions to retrieve the data across invocations

ALTER TABLE public.ingest_jobs
ADD COLUMN IF NOT EXISTS payload TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status
ON public.ingest_jobs(status, "createdAt");
