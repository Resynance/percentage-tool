-- Time Reporting Analysis Feature
-- This migration creates all tables needed for workforce time analysis

-- =====================================================
-- 1. TIME REPORT RECORDS
-- Store parsed daily time log data from CSV imports
-- =====================================================
CREATE TABLE IF NOT EXISTS public.time_report_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    worker_name TEXT NOT NULL,
    worker_email TEXT NOT NULL,
    work_date DATE NOT NULL,
    hours_worked DECIMAL(10, 5) NOT NULL,
    notes TEXT,
    status TEXT, -- from CSV: Approved, Rejected, Contacting, etc.
    role TEXT, -- expert role from CSV
    group_name TEXT, -- group assignment from CSV

    -- Summary metrics (from CSV summary columns)
    total_tasks_created INTEGER DEFAULT 0,
    total_tasks_qaed INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    import_batch_id TEXT, -- to track which CSV import this came from

    -- Unique constraint to prevent duplicate date entries per worker
    UNIQUE (worker_email, work_date)
);

-- Indexes for fast queries
CREATE INDEX idx_time_reports_worker_email ON public.time_report_records(worker_email);
CREATE INDEX idx_time_reports_work_date ON public.time_report_records(work_date);
CREATE INDEX idx_time_reports_import_batch ON public.time_report_records(import_batch_id);

COMMENT ON TABLE public.time_report_records IS 'Stores daily time log entries from worker time tracking CSV imports';

-- =====================================================
-- 2. BILLABLE MEETINGS
-- Database of all billable meetings with attendees
-- =====================================================
CREATE TABLE IF NOT EXISTS public.billable_meetings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    title TEXT NOT NULL,
    description TEXT,
    meeting_date DATE NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL, -- calculated from start/end

    -- Attendees stored as JSON array of emails
    attendees JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Meeting type/category (optional)
    meeting_type TEXT, -- e.g., "Onboarding", "Review Session", "Training", etc.

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_id UUID REFERENCES public.profiles(id),

    -- Validation
    CONSTRAINT valid_duration CHECK (duration_minutes > 0),
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Indexes for fast queries
CREATE INDEX idx_meetings_date ON public.billable_meetings(meeting_date);
CREATE INDEX idx_meetings_attendees ON public.billable_meetings USING GIN(attendees);
CREATE INDEX idx_meetings_type ON public.billable_meetings(meeting_type);

COMMENT ON TABLE public.billable_meetings IS 'Database of all billable meetings with attendee lists for verification';

-- =====================================================
-- 3. TIME ESTIMATES
-- LLM-generated time estimates for tasks and QA work
-- =====================================================
CREATE TABLE IF NOT EXISTS public.time_estimates (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    time_report_id TEXT NOT NULL REFERENCES public.time_report_records(id) ON DELETE CASCADE,

    work_type TEXT NOT NULL, -- 'TASK' or 'QA'
    work_description TEXT NOT NULL, -- the description being estimated

    -- LLM estimate results
    estimated_minutes INTEGER NOT NULL,
    confidence_score DECIMAL(3, 2), -- 0.00 to 1.00
    reasoning TEXT, -- LLM's reasoning for the estimate

    -- LLM details
    llm_model TEXT,
    llm_provider TEXT,
    llm_cost DECIMAL(10, 6),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_estimate CHECK (estimated_minutes > 0),
    CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 1)
);

-- Indexes
CREATE INDEX idx_time_estimates_report ON public.time_estimates(time_report_id);
CREATE INDEX idx_time_estimates_work_type ON public.time_estimates(work_type);

COMMENT ON TABLE public.time_estimates IS 'LLM-generated time estimates for tasks and QA work';

-- =====================================================
-- 4. MEETING CLAIMS
-- LLM-parsed meeting claims from worker notes
-- =====================================================
CREATE TABLE IF NOT EXISTS public.meeting_claims (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    time_report_id TEXT NOT NULL REFERENCES public.time_report_records(id) ON DELETE CASCADE,

    -- Extracted meeting information
    claimed_meeting_name TEXT NOT NULL,
    claimed_duration_minutes INTEGER,
    extraction_confidence DECIMAL(3, 2), -- how confident the LLM is about this claim

    -- Verification results
    verified BOOLEAN DEFAULT FALSE,
    matched_meeting_id TEXT REFERENCES public.billable_meetings(id),
    verification_notes TEXT, -- why it matched or didn't match

    -- LLM details
    llm_model TEXT,
    llm_provider TEXT,
    llm_cost DECIMAL(10, 6),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,

    CONSTRAINT valid_claim_confidence CHECK (extraction_confidence >= 0 AND extraction_confidence <= 1)
);

-- Indexes
CREATE INDEX idx_meeting_claims_report ON public.meeting_claims(time_report_id);
CREATE INDEX idx_meeting_claims_verified ON public.meeting_claims(verified);
CREATE INDEX idx_meeting_claims_matched ON public.meeting_claims(matched_meeting_id);

COMMENT ON TABLE public.meeting_claims IS 'LLM-extracted meeting claims from worker notes with verification status';

-- =====================================================
-- 5. QUALITY SCORES
-- LLM-generated quality assessments for work
-- =====================================================
CREATE TABLE IF NOT EXISTS public.quality_scores (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    time_report_id TEXT NOT NULL REFERENCES public.time_report_records(id) ON DELETE CASCADE,

    work_type TEXT NOT NULL, -- 'TASK' or 'QA'
    work_description TEXT NOT NULL,

    -- Quality assessment
    quality_score DECIMAL(3, 1) NOT NULL, -- 1.0 to 10.0
    quality_reasoning TEXT, -- LLM's detailed quality analysis

    -- Quality dimensions (optional breakdown)
    completeness_score DECIMAL(3, 1),
    accuracy_score DECIMAL(3, 1),
    clarity_score DECIMAL(3, 1),

    -- LLM details
    llm_model TEXT,
    llm_provider TEXT,
    llm_cost DECIMAL(10, 6),

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_quality_score CHECK (quality_score >= 1.0 AND quality_score <= 10.0),
    CONSTRAINT valid_completeness CHECK (completeness_score IS NULL OR (completeness_score >= 1.0 AND completeness_score <= 10.0)),
    CONSTRAINT valid_accuracy CHECK (accuracy_score IS NULL OR (accuracy_score >= 1.0 AND accuracy_score <= 10.0)),
    CONSTRAINT valid_clarity CHECK (clarity_score IS NULL OR (clarity_score >= 1.0 AND clarity_score <= 10.0))
);

-- Indexes
CREATE INDEX idx_quality_scores_report ON public.quality_scores(time_report_id);
CREATE INDEX idx_quality_scores_type ON public.quality_scores(work_type);
CREATE INDEX idx_quality_scores_score ON public.quality_scores(quality_score);

COMMENT ON TABLE public.quality_scores IS 'LLM-generated quality assessments for tasks and QA work';

-- =====================================================
-- 6. TIME ANALYSIS FLAGS
-- Workers flagged for time discrepancies
-- =====================================================
CREATE TYPE flag_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE flag_status AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');

CREATE TABLE IF NOT EXISTS public.time_analysis_flags (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    time_report_id TEXT NOT NULL REFERENCES public.time_report_records(id) ON DELETE CASCADE,

    worker_name TEXT NOT NULL,
    worker_email TEXT NOT NULL,
    work_date DATE NOT NULL,

    -- Flag details
    flag_type TEXT NOT NULL, -- 'TIME_DISCREPANCY', 'LOW_QUALITY', 'MISSING_MEETING', etc.
    severity flag_severity NOT NULL DEFAULT 'MEDIUM',
    status flag_status NOT NULL DEFAULT 'PENDING',

    -- Analysis data
    expected_hours DECIMAL(10, 5),
    actual_hours DECIMAL(10, 5),
    discrepancy_percentage DECIMAL(5, 2), -- percentage difference
    meeting_hours_claimed DECIMAL(10, 5),
    meeting_hours_verified DECIMAL(10, 5),
    average_quality_score DECIMAL(3, 1),

    -- Flag reasoning
    flag_reason TEXT NOT NULL, -- detailed explanation
    analysis_threshold DECIMAL(5, 2), -- the threshold used (e.g., 15%)

    -- Resolution
    reviewed_by_id UUID REFERENCES public.profiles(id),
    reviewed_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_flags_worker_email ON public.time_analysis_flags(worker_email);
CREATE INDEX idx_flags_status ON public.time_analysis_flags(status);
CREATE INDEX idx_flags_severity ON public.time_analysis_flags(severity);
CREATE INDEX idx_flags_work_date ON public.time_analysis_flags(work_date);
CREATE INDEX idx_flags_type ON public.time_analysis_flags(flag_type);

COMMENT ON TABLE public.time_analysis_flags IS 'Workers flagged for manual review due to time discrepancies or quality issues';

-- =====================================================
-- 7. ANALYSIS CONFIGURATIONS
-- Store configurable thresholds and settings
-- =====================================================
CREATE TABLE IF NOT EXISTS public.time_analysis_configs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    config_name TEXT UNIQUE NOT NULL,

    -- Time thresholds
    time_discrepancy_threshold DECIMAL(5, 2) NOT NULL DEFAULT 15.00, -- percentage

    -- Expected time ranges (in minutes)
    task_time_min INTEGER NOT NULL DEFAULT 45,
    task_time_max INTEGER NOT NULL DEFAULT 60,
    qa_time_min INTEGER NOT NULL DEFAULT 5,
    qa_time_max INTEGER NOT NULL DEFAULT 20,

    -- Quality thresholds
    min_acceptable_quality DECIMAL(3, 1) DEFAULT 6.0,

    -- Active configuration
    is_active BOOLEAN NOT NULL DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_id UUID REFERENCES public.profiles(id)
);

-- Ensure only one active config at a time
CREATE UNIQUE INDEX idx_one_active_config ON public.time_analysis_configs(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE public.time_analysis_configs IS 'Configurable thresholds and settings for time analysis';

-- Insert default configuration
INSERT INTO public.time_analysis_configs (config_name, is_active)
VALUES ('Default Configuration', TRUE)
ON CONFLICT (config_name) DO NOTHING;

-- =====================================================
-- 8. RLS POLICIES
-- Fleet and Admin only access
-- =====================================================

-- Time report records
ALTER TABLE public.time_report_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_reports_fleet_admin_select"
    ON public.time_report_records FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "time_reports_fleet_admin_insert"
    ON public.time_report_records FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "time_reports_fleet_admin_update"
    ON public.time_report_records FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

CREATE POLICY "time_reports_fleet_admin_delete"
    ON public.time_report_records FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Billable meetings
ALTER TABLE public.billable_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_fleet_admin_all"
    ON public.billable_meetings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Time estimates
ALTER TABLE public.time_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "estimates_fleet_admin_all"
    ON public.time_estimates FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Meeting claims
ALTER TABLE public.meeting_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "claims_fleet_admin_all"
    ON public.meeting_claims FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Quality scores
ALTER TABLE public.quality_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quality_fleet_admin_all"
    ON public.quality_scores FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Time analysis flags
ALTER TABLE public.time_analysis_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flags_fleet_admin_all"
    ON public.time_analysis_flags FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Analysis configs
ALTER TABLE public.time_analysis_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "configs_fleet_admin_all"
    ON public.time_analysis_configs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- =====================================================
-- 9. TRIGGERS FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_time_reporting_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER time_reports_updated_at
    BEFORE UPDATE ON public.time_report_records
    FOR EACH ROW
    EXECUTE FUNCTION update_time_reporting_updated_at();

CREATE TRIGGER meetings_updated_at
    BEFORE UPDATE ON public.billable_meetings
    FOR EACH ROW
    EXECUTE FUNCTION update_time_reporting_updated_at();

CREATE TRIGGER flags_updated_at
    BEFORE UPDATE ON public.time_analysis_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_time_reporting_updated_at();

CREATE TRIGGER configs_updated_at
    BEFORE UPDATE ON public.time_analysis_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_time_reporting_updated_at();
