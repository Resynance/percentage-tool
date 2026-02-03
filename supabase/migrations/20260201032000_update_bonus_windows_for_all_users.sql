-- Update bonus_windows to track all users instead of specific users
-- Only proceed if the table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bonus_windows'
  ) THEN
    -- Drop columns if they exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bonus_windows' AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.bonus_windows DROP COLUMN user_id;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bonus_windows' AND column_name = 'user_email'
    ) THEN
      ALTER TABLE public.bonus_windows DROP COLUMN user_email;
    END IF;

    -- Add name column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'bonus_windows' AND column_name = 'name'
    ) THEN
      ALTER TABLE public.bonus_windows ADD COLUMN name TEXT NOT NULL DEFAULT 'Bonus Window';
    END IF;

    -- Drop the old index on user_id since it no longer exists
    DROP INDEX IF EXISTS bonus_windows_user_id_idx;
  END IF;
END $$;
