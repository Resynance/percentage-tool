-- Create flag type enum
CREATE TYPE "FlagType" AS ENUM (
  'QUALITY_ISSUE',
  'POLICY_VIOLATION',
  'ATTENDANCE',
  'COMMUNICATION',
  'PERFORMANCE',
  'OTHER'
);

-- Create flag status enum
CREATE TYPE "FlagStatus" AS ENUM (
  'ACTIVE',
  'UNDER_REVIEW',
  'RESOLVED',
  'APPEALED'
);

-- Create worker_flags table
CREATE TABLE public.worker_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_email TEXT NOT NULL,
  flag_type "FlagType" NOT NULL,
  status "FlagStatus" NOT NULL DEFAULT 'ACTIVE',
  reason TEXT NOT NULL,
  detailed_notes TEXT,
  flagged_by_id UUID NOT NULL REFERENCES auth.users(id),
  flagged_by_email TEXT NOT NULL,
  resolution_notes TEXT,
  resolved_by_id UUID REFERENCES auth.users(id),
  resolved_by_email TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_worker_flags_worker_id ON public.worker_flags(worker_id);
CREATE INDEX idx_worker_flags_flagged_by_id ON public.worker_flags(flagged_by_id);
CREATE INDEX idx_worker_flags_status ON public.worker_flags(status);
CREATE INDEX idx_worker_flags_flag_type ON public.worker_flags(flag_type);
CREATE INDEX idx_worker_flags_created_at ON public.worker_flags(created_at DESC);

-- Enable RLS
ALTER TABLE public.worker_flags ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (FLEET and ADMIN only)
CREATE POLICY "FLEET and ADMIN can view all worker flags"
  ON public.worker_flags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('FLEET', 'ADMIN')
    )
  );

CREATE POLICY "FLEET and ADMIN can create worker flags"
  ON public.worker_flags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('FLEET', 'ADMIN')
    )
  );

CREATE POLICY "FLEET and ADMIN can update worker flags"
  ON public.worker_flags
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('FLEET', 'ADMIN')
    )
  );

CREATE POLICY "FLEET and ADMIN can delete worker flags"
  ON public.worker_flags
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('FLEET', 'ADMIN')
    )
  );

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_worker_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER worker_flags_updated_at
  BEFORE UPDATE ON public.worker_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_worker_flags_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_flags TO authenticated;
GRANT SELECT ON public.worker_flags TO anon;
