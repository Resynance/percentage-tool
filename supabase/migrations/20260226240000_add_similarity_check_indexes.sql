-- Add composite indexes for full similarity check query optimization
-- These indexes significantly improve performance when filtering and ordering by createdAt

-- Index for queries filtering by type and ordering by createdAt (no environment filter)
CREATE INDEX IF NOT EXISTS idx_data_records_type_createdat
ON public.data_records (type, "createdAt" DESC);

-- Index for queries filtering by type and environment, ordering by createdAt
CREATE INDEX IF NOT EXISTS idx_data_records_type_env_createdat
ON public.data_records (type, environment, "createdAt" DESC);

-- Optional: Index for user filtering (createdByName, createdByEmail)
CREATE INDEX IF NOT EXISTS idx_data_records_created_by_name
ON public.data_records ("createdByName");

CREATE INDEX IF NOT EXISTS idx_data_records_created_by_email
ON public.data_records ("createdByEmail");

-- Add comment explaining the optimization
COMMENT ON INDEX idx_data_records_type_createdat IS
'Optimizes full similarity check queries when filtering by type and ordering by creation date';

COMMENT ON INDEX idx_data_records_type_env_createdat IS
'Optimizes full similarity check queries when filtering by type+environment and ordering by creation date';
