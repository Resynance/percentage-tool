-- Add created_at field to store original prompt creation timestamp
ALTER TABLE public.prompt_authenticity_records
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP;

-- Add index for date range queries
CREATE INDEX IF NOT EXISTS idx_prompt_records_created_at ON public.prompt_authenticity_records(created_at);
