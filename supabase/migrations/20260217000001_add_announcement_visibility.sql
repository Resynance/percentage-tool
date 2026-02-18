-- Add visibility enum for announcements
CREATE TYPE public.announcement_visibility AS ENUM ('ALL_USERS', 'QA_AND_ABOVE');

-- Add visibility column to announcements table
ALTER TABLE public.announcements
ADD COLUMN visibility public.announcement_visibility NOT NULL DEFAULT 'ALL_USERS';

-- Add index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_announcements_visibility ON public.announcements(visibility);

-- Update RLS policy to enforce visibility based on user role
-- Drop the old policy first
DROP POLICY IF EXISTS "Anyone can view published announcements" ON public.announcements;

-- Create new policy that checks both published status and visibility
CREATE POLICY "Users can view announcements based on visibility"
  ON public.announcements
  FOR SELECT
  USING (
    published = true
    AND (
      visibility = 'ALL_USERS'
      OR (
        visibility = 'QA_AND_ABOVE'
        AND EXISTS (
          SELECT 1 FROM public.profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role IN ('QA', 'CORE', 'FLEET', 'MANAGER', 'ADMIN')
        )
      )
    )
  );

-- Add comment
COMMENT ON COLUMN public.announcements.visibility IS 'Controls which user roles can see this announcement: ALL_USERS or QA_AND_ABOVE';
