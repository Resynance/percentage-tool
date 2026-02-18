-- Add visibility enum for announcements
CREATE TYPE public.announcement_visibility AS ENUM ('ALL_USERS', 'QA_AND_ABOVE');

-- Add visibility column to announcements table
ALTER TABLE public.announcements
ADD COLUMN visibility public.announcement_visibility NOT NULL DEFAULT 'ALL_USERS';

-- Add index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_announcements_visibility ON public.announcements(visibility);

-- Add comment
COMMENT ON COLUMN public.announcements.visibility IS 'Controls which user roles can see this announcement: ALL_USERS or QA_AND_ABOVE';
