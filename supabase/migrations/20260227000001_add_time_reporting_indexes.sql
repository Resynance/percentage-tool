-- Add indexes for time reporting screening performance
-- These indexes will significantly speed up queries as data grows

-- Index on worker_email for grouping and filtering
CREATE INDEX IF NOT EXISTS idx_time_report_records_worker_email
ON public.time_report_records(worker_email);

-- Index on work_date for date range filters
CREATE INDEX IF NOT EXISTS idx_time_report_records_work_date
ON public.time_report_records(work_date DESC);

-- Composite index for worker + date queries (most common pattern)
CREATE INDEX IF NOT EXISTS idx_time_report_records_worker_date
ON public.time_report_records(worker_email, work_date DESC);

-- Index on created_at for recent data queries
CREATE INDEX IF NOT EXISTS idx_time_report_records_created_at
ON public.time_report_records(created_at DESC);

COMMENT ON INDEX idx_time_report_records_worker_email IS 'Speeds up worker grouping and filtering';
COMMENT ON INDEX idx_time_report_records_work_date IS 'Speeds up date range queries';
COMMENT ON INDEX idx_time_report_records_worker_date IS 'Optimizes combined worker+date queries';
COMMENT ON INDEX idx_time_report_records_created_at IS 'Speeds up recent data retrieval';
