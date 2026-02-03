-- Add optional tier 2 targets for bonus windows
-- Only proceed if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bonus_windows'
  ) THEN
    ALTER TABLE public.bonus_windows
    ADD COLUMN IF NOT EXISTS target_task_count_tier2 INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS target_feedback_count_tier2 INTEGER DEFAULT 0;

    COMMENT ON COLUMN public.bonus_windows.target_task_count_tier2 IS 'Optional higher tier task target for enhanced bonus';
    COMMENT ON COLUMN public.bonus_windows.target_feedback_count_tier2 IS 'Optional higher tier feedback target for enhanced bonus';
  END IF;
END $$;
