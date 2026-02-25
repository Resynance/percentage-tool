-- Add batchSize and lastHeartbeat to prompt_authenticity_jobs table
-- These fields support job resumption and zombie detection

-- Add batch_size column (defaults to 200)
ALTER TABLE public.prompt_authenticity_jobs
ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 200 NOT NULL;

-- Add last_heartbeat column for zombie job detection
ALTER TABLE public.prompt_authenticity_jobs
ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

-- Comment explaining the columns
COMMENT ON COLUMN public.prompt_authenticity_jobs.batch_size IS 'Number of prompts to fetch per batch iteration';
COMMENT ON COLUMN public.prompt_authenticity_jobs.last_heartbeat IS 'Last time the job was alive (updated every 30s). Used to detect zombie jobs killed by serverless runtime.';
