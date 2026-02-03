-- Update bonus_windows to have separate targets for tasks and feedback
-- Only proceed if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bonus_windows'
  ) THEN
    -- Add new columns
    ALTER TABLE public.bonus_windows
    ADD COLUMN IF NOT EXISTS target_task_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS target_feedback_count INTEGER NOT NULL DEFAULT 0;

    -- Drop the old single target_count column
    ALTER TABLE public.bonus_windows
    DROP COLUMN IF EXISTS target_count;

    -- Add constraint to ensure at least one target is set
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'bonus_windows' AND constraint_name = 'at_least_one_target'
    ) THEN
      ALTER TABLE public.bonus_windows
      ADD CONSTRAINT at_least_one_target CHECK (target_task_count > 0 OR target_feedback_count > 0);
    END IF;
  END IF;
END $$;
