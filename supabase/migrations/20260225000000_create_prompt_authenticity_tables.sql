-- Prompt Authenticity Analysis Tables

-- Main prompts table
CREATE TABLE IF NOT EXISTS public.prompt_authenticity_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id TEXT NOT NULL UNIQUE,
    task_key TEXT NOT NULL,
    prompt TEXT NOT NULL,
    version_no INTEGER,
    is_active BOOLEAN,
    created_by_name TEXT,
    created_by_email TEXT,
    env_key TEXT,
    task_lifecycle_status TEXT,
    task_modality TEXT,
    scenario_title TEXT,
    task_complexity_tier TEXT,

    -- Analysis results
    analysis_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, ANALYZING, COMPLETED, FAILED
    is_likely_non_native BOOLEAN,
    non_native_confidence DECIMAL(5,2),
    non_native_indicators JSONB,
    is_likely_ai_generated BOOLEAN,
    ai_generated_confidence DECIMAL(5,2),
    ai_generated_indicators JSONB,
    overall_assessment TEXT,
    recommendations JSONB,

    -- Metadata
    llm_model TEXT,
    llm_provider TEXT,
    llm_cost DECIMAL(10,6),
    analyzed_at TIMESTAMP,
    error_message TEXT,

    -- Timestamps
    imported_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT analysis_status_check CHECK (
        analysis_status IN ('PENDING', 'ANALYZING', 'COMPLETED', 'FAILED')
    )
);

-- Analysis jobs table
CREATE TABLE IF NOT EXISTS public.prompt_authenticity_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, PAUSED, COMPLETED, FAILED, CANCELLED
    total_prompts INTEGER NOT NULL DEFAULT 0,
    analyzed_prompts INTEGER NOT NULL DEFAULT 0,
    failed_prompts INTEGER NOT NULL DEFAULT 0,
    flagged_non_native INTEGER NOT NULL DEFAULT 0,
    flagged_ai_generated INTEGER NOT NULL DEFAULT 0,
    total_cost DECIMAL(10,6) NOT NULL DEFAULT 0,

    -- Job metadata
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    paused_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT job_status_check CHECK (
        status IN ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prompt_records_status ON public.prompt_authenticity_records(analysis_status);
CREATE INDEX IF NOT EXISTS idx_prompt_records_version_id ON public.prompt_authenticity_records(version_id);
CREATE INDEX IF NOT EXISTS idx_prompt_records_task_key ON public.prompt_authenticity_records(task_key);
CREATE INDEX IF NOT EXISTS idx_prompt_records_created_by ON public.prompt_authenticity_records(created_by_email);
CREATE INDEX IF NOT EXISTS idx_prompt_records_non_native ON public.prompt_authenticity_records(is_likely_non_native) WHERE is_likely_non_native = true;
CREATE INDEX IF NOT EXISTS idx_prompt_records_ai_generated ON public.prompt_authenticity_records(is_likely_ai_generated) WHERE is_likely_ai_generated = true;
CREATE INDEX IF NOT EXISTS idx_prompt_jobs_status ON public.prompt_authenticity_jobs(status);

-- RLS Policies (Fleet and Admin only)
ALTER TABLE public.prompt_authenticity_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_authenticity_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Fleet and Admin can view prompt records" ON public.prompt_authenticity_records
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "Fleet and Admin can insert prompt records" ON public.prompt_authenticity_records
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "Fleet and Admin can update prompt records" ON public.prompt_authenticity_records
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "Fleet and Admin can view jobs" ON public.prompt_authenticity_jobs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "Fleet and Admin can insert jobs" ON public.prompt_authenticity_jobs
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "Fleet and Admin can update jobs" ON public.prompt_authenticity_jobs
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_prompt_records_updated_at BEFORE UPDATE ON public.prompt_authenticity_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prompt_jobs_updated_at BEFORE UPDATE ON public.prompt_authenticity_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
