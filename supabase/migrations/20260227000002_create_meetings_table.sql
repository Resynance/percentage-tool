-- Create meetings table for managing meeting definitions
CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern TEXT, -- 'weekly', 'biweekly', 'monthly', 'quarterly'
  expected_duration_hours DECIMAL(5,2),
  category TEXT, -- 'team-sync', 'planning', '1-on-1', 'all-hands', 'training', 'client', 'other'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_meetings_is_active ON public.meetings(is_active);
CREATE INDEX IF NOT EXISTS idx_meetings_category ON public.meetings(category);
CREATE INDEX IF NOT EXISTS idx_meetings_title ON public.meetings(title);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_meetings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meetings_updated_at_trigger
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION update_meetings_updated_at();

-- Add comments
COMMENT ON TABLE public.meetings IS 'Master catalog of meeting definitions for time reporting';
COMMENT ON COLUMN public.meetings.title IS 'Meeting title/name';
COMMENT ON COLUMN public.meetings.description IS 'Optional description of meeting purpose';
COMMENT ON COLUMN public.meetings.is_recurring IS 'Whether this is a recurring meeting';
COMMENT ON COLUMN public.meetings.recurrence_pattern IS 'How often the meeting recurs (weekly, biweekly, monthly, quarterly)';
COMMENT ON COLUMN public.meetings.expected_duration_hours IS 'Expected duration in hours';
COMMENT ON COLUMN public.meetings.category IS 'Meeting category for grouping';
COMMENT ON COLUMN public.meetings.is_active IS 'Whether this meeting is active and available for time reporting';

-- Insert some sample meetings
INSERT INTO public.meetings (title, description, is_recurring, recurrence_pattern, expected_duration_hours, category, is_active, created_by) VALUES
  ('Weekly Team Sync', 'Regular team synchronization meeting', true, 'weekly', 1.0, 'team-sync', true, 'system'),
  ('Sprint Planning', 'Bi-weekly sprint planning session', true, 'biweekly', 2.0, 'planning', true, 'system'),
  ('1-on-1 with Manager', 'Individual check-in with direct manager', true, 'weekly', 0.5, '1-on-1', true, 'system'),
  ('Monthly All-Hands', 'Company-wide monthly meeting', true, 'monthly', 1.0, 'all-hands', true, 'system'),
  ('Training Session', 'Team training and development', false, null, 2.0, 'training', true, 'system'),
  ('Client Review', 'Client progress review meeting', true, 'weekly', 1.5, 'client', true, 'system')
ON CONFLICT DO NOTHING;
