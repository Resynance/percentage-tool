-- Create qa_feedback_ratings table for QA worker feedback analysis
CREATE TABLE IF NOT EXISTS public.qa_feedback_ratings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,

    -- Core identifiers
    rating_id TEXT NOT NULL UNIQUE, -- Unique ID from CSV
    feedback_id TEXT NOT NULL, -- ID of the feedback being rated
    eval_task_id TEXT, -- FK to data_records (nullable, only if linked)

    -- Rating information
    is_helpful BOOLEAN NOT NULL, -- true = positive, false = negative
    is_dispute BOOLEAN DEFAULT false,
    dispute_status TEXT, -- e.g., "Resolved", "Pending", "Rejected"
    dispute_reason TEXT,

    -- People involved
    rater_name TEXT,
    rater_email TEXT NOT NULL,
    qa_name TEXT,
    qa_email TEXT NOT NULL,

    -- Timestamps
    rated_at TIMESTAMPTZ NOT NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Resolution information
    resolved_by_name TEXT,
    resolution_reason TEXT,

    -- Foreign key constraint
    CONSTRAINT fk_eval_task FOREIGN KEY (eval_task_id)
        REFERENCES public.data_records(id)
        ON DELETE SET NULL
);

-- Create indexes for performance
CREATE INDEX idx_qa_feedback_ratings_qa_email ON public.qa_feedback_ratings(qa_email);
CREATE INDEX idx_qa_feedback_ratings_is_helpful ON public.qa_feedback_ratings(is_helpful);
CREATE INDEX idx_qa_feedback_ratings_rated_at ON public.qa_feedback_ratings(rated_at DESC);
CREATE INDEX idx_qa_feedback_ratings_eval_task_id ON public.qa_feedback_ratings(eval_task_id) WHERE eval_task_id IS NOT NULL;
CREATE INDEX idx_qa_feedback_ratings_composite ON public.qa_feedback_ratings(qa_email, rated_at DESC);
CREATE INDEX idx_qa_feedback_ratings_rater_email ON public.qa_feedback_ratings(rater_email);

-- Add RLS (Row Level Security) policies
ALTER TABLE public.qa_feedback_ratings ENABLE ROW LEVEL SECURITY;

-- Fleet and Admin can SELECT
CREATE POLICY "Fleet and Admin can view feedback ratings"
    ON public.qa_feedback_ratings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN', 'MANAGER')
        )
    );

-- Admin can INSERT
CREATE POLICY "Admin can insert feedback ratings"
    ON public.qa_feedback_ratings
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'ADMIN'
        )
    );

-- Admin can UPDATE
CREATE POLICY "Admin can update feedback ratings"
    ON public.qa_feedback_ratings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'ADMIN'
        )
    );

-- Add comment
COMMENT ON TABLE public.qa_feedback_ratings IS 'Stores ratings of QA worker feedback from external rating system. Used for QA performance analysis and quality monitoring.';
