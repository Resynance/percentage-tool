-- Add date range fields to jobs table for filtering prompts during analysis
ALTER TABLE public.prompt_authenticity_jobs
ADD COLUMN IF NOT EXISTS filter_start_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS filter_end_date TIMESTAMP;
