-- Create guidelines table
CREATE TABLE IF NOT EXISTS public.guidelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    content TEXT NOT NULL, -- Base64-encoded PDF
    environment TEXT, -- Optional environment association (NULL = default/global)
    uploaded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_guidelines_environment ON public.guidelines(environment);
CREATE INDEX IF NOT EXISTS idx_guidelines_uploaded_by ON public.guidelines(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_guidelines_created_at ON public.guidelines(created_at DESC);

-- Add comment
COMMENT ON TABLE public.guidelines IS 'PDF-based guidelines for alignment analysis. Can be environment-specific or global (environment = NULL).';
