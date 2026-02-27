-- ============================================================================
-- SAFE PROJECT TO ENVIRONMENT MIGRATION
-- ============================================================================
-- This migration safely transitions from project-based to environment-based
-- organization WITHOUT data loss.
--
-- IMPORTANT: Run verification scripts BEFORE and AFTER this migration
--
-- Pre-requisites:
--  1. Backup database
--  2. Run pre-migration verification (see verify_migration.sql)
--  3. Test on staging environment first
-- ============================================================================

-- Step 1: Ensure environment column exists and is properly indexed
-- ============================================================================
ALTER TABLE public.data_records ADD COLUMN IF NOT EXISTS environment TEXT;

CREATE INDEX IF NOT EXISTS idx_data_records_environment 
ON public.data_records(environment);

COMMENT ON COLUMN public.data_records.environment IS 
'Environment identifier (migrated from project.name). Used for data organization.';

-- Step 2: Migrate project data to environment field
-- ============================================================================
-- Strategy: Copy project.name to data_records.environment
-- This preserves the organizational structure while moving to simpler model

DO $$
DECLARE
    records_migrated INTEGER := 0;
    records_with_null_project INTEGER := 0;
BEGIN
    -- Count records that need migration
    SELECT COUNT(*) INTO records_with_null_project
    FROM public.data_records
    WHERE environment IS NULL OR environment = '';

    RAISE NOTICE 'Starting migration of % records...', records_with_null_project;

    -- Migrate records that have a project_id
    UPDATE public.data_records dr
    SET environment = COALESCE(p.name, p.id::text)
    FROM public.projects p
    WHERE dr.project_id = p.id
    AND (dr.environment IS NULL OR dr.environment = '');

    GET DIAGNOSTICS records_migrated = ROW_COUNT;
    RAISE NOTICE 'Migrated % records from projects to environments', records_migrated;

    -- Handle orphaned records (no project_id)
    UPDATE public.data_records
    SET environment = 'migrated-orphaned'
    WHERE (environment IS NULL OR environment = '')
    AND project_id IS NULL;

    GET DIAGNOSTICS records_with_null_project = ROW_COUNT;
    RAISE NOTICE 'Set default environment for % orphaned records', records_with_null_project;

    -- Handle records with project_id but no matching project
    UPDATE public.data_records
    SET environment = 'migrated-unknown-' || project_id::text
    WHERE (environment IS NULL OR environment = '')
    AND project_id IS NOT NULL;

    GET DIAGNOSTICS records_with_null_project = ROW_COUNT;
    IF records_with_null_project > 0 THEN
        RAISE WARNING 'Found % records with project_id but no matching project!', 
                      records_with_null_project;
    END IF;

END $$;

-- Step 3: Verify migration (fail if any records still have NULL environment)
-- ============================================================================
DO $$
DECLARE
    null_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO null_count
    FROM public.data_records
    WHERE environment IS NULL OR environment = '';

    IF null_count > 0 THEN
        RAISE EXCEPTION 'Migration incomplete: % records still have NULL environment', null_count;
    END IF;

    RAISE NOTICE 'Verification passed: All records have environment set';
END $$;

-- Step 4: Make environment field required (only after successful migration)
-- ============================================================================
ALTER TABLE public.data_records 
ALTER COLUMN environment SET NOT NULL;

COMMENT ON COLUMN public.data_records.environment IS 
'Environment identifier (REQUIRED). Used for data organization. Migrated from project system.';

-- Step 5: Create backup of project mappings (for potential rollback)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public._migration_project_backup (
    record_id TEXT PRIMARY KEY,
    project_id TEXT,
    project_name TEXT,
    environment TEXT,
    migrated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public._migration_project_backup (record_id, project_id, project_name, environment)
SELECT 
    dr.id,
    dr.project_id::text,
    p.name,
    dr.environment
FROM public.data_records dr
LEFT JOIN public.projects p ON dr.project_id = p.id
ON CONFLICT (record_id) DO NOTHING;

COMMENT ON TABLE public._migration_project_backup IS 
'Backup of project→environment mappings for rollback purposes. Safe to drop after confirming migration success.';

-- Step 6: Log migration completion
-- ============================================================================
DO $$
DECLARE
    total_records INTEGER;
    unique_environments INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_records FROM public.data_records;
    SELECT COUNT(DISTINCT environment) INTO unique_environments FROM public.data_records;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total records migrated: %', total_records;
    RAISE NOTICE 'Unique environments: %', unique_environments;
    RAISE NOTICE 'Backup table created: _migration_project_backup';
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Run post-migration verification script';
    RAISE NOTICE '2. Test application functionality';
    RAISE NOTICE '3. Keep backup table for 30 days';
    RAISE NOTICE '4. DO NOT drop project_id column until fully verified';
    RAISE NOTICE '========================================';
END $$;
