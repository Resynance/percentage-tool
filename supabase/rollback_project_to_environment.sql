-- ============================================================================
-- ROLLBACK PROJECT TO ENVIRONMENT MIGRATION
-- ============================================================================
-- This script safely rolls back the migration from environment-based to
-- project-based organization using the backup table.
--
-- IMPORTANT: Only run this if the migration needs to be reversed
--
-- Pre-requisites:
--  1. Backup table _migration_project_backup exists
--  2. Review backup data before proceeding
--  3. Test on staging environment first
-- ============================================================================

-- Step 1: Verify backup table exists
-- ============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = '_migration_project_backup'
    ) THEN
        RAISE EXCEPTION 'Backup table _migration_project_backup does not exist. Cannot rollback.';
    END IF;

    RAISE NOTICE 'Backup table found. Proceeding with rollback...';
END $$;

-- Step 2: Remove NOT NULL constraint from environment (allow rollback)
-- ============================================================================
ALTER TABLE public.data_records
ALTER COLUMN environment DROP NOT NULL;

DO $$
BEGIN
    RAISE NOTICE 'Removed NOT NULL constraint from environment column';
END $$;

-- Step 3: Restore environment values from backup
-- ============================================================================
DO $$
DECLARE
    records_restored INTEGER := 0;
    records_not_in_backup INTEGER := 0;
BEGIN
    -- Restore environment from backup
    UPDATE public.data_records dr
    SET environment = b.environment
    FROM public._migration_project_backup b
    WHERE dr.id = b.record_id;

    GET DIAGNOSTICS records_restored = ROW_COUNT;
    RAISE NOTICE 'Restored environment values for % records from backup', records_restored;

    -- Count records not in backup (created after migration)
    SELECT COUNT(*) INTO records_not_in_backup
    FROM public.data_records dr
    LEFT JOIN public._migration_project_backup b ON dr.id = b.record_id
    WHERE b.record_id IS NULL;

    IF records_not_in_backup > 0 THEN
        RAISE WARNING '% records were created after migration and are not in backup!',
                      records_not_in_backup;
        RAISE NOTICE 'These records will keep their current environment value';
    END IF;
END $$;

-- Step 4: Verify rollback (check for orphaned records)
-- ============================================================================
DO $$
DECLARE
    orphaned_count INTEGER;
    migrated_unknown_count INTEGER;
BEGIN
    -- Count records still marked as orphaned
    SELECT COUNT(*) INTO orphaned_count
    FROM public.data_records
    WHERE environment = 'migrated-orphaned';

    IF orphaned_count > 0 THEN
        RAISE WARNING '% records are still marked as "migrated-orphaned"', orphaned_count;
    END IF;

    -- Count records still marked as unknown
    SELECT COUNT(*) INTO migrated_unknown_count
    FROM public.data_records
    WHERE environment LIKE 'migrated-unknown-%';

    IF migrated_unknown_count > 0 THEN
        RAISE WARNING '% records are still marked as "migrated-unknown-*"', migrated_unknown_count;
    END IF;

    RAISE NOTICE 'Rollback verification complete';
END $$;

-- Step 5: Log rollback completion
-- ============================================================================
DO $$
DECLARE
    total_records INTEGER;
    unique_environments INTEGER;
    records_in_backup INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_records FROM public.data_records;
    SELECT COUNT(DISTINCT environment) INTO unique_environments FROM public.data_records;
    SELECT COUNT(*) INTO records_in_backup FROM public._migration_project_backup;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'ROLLBACK COMPLETED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total records: %', total_records;
    RAISE NOTICE 'Records in backup: %', records_in_backup;
    RAISE NOTICE 'Unique environments: %', unique_environments;
    RAISE NOTICE '';
    RAISE NOTICE 'NEXT STEPS:';
    RAISE NOTICE '1. Run verification script to check data integrity';
    RAISE NOTICE '2. Test application functionality';
    RAISE NOTICE '3. Keep backup table until fully verified';
    RAISE NOTICE '4. Consider re-running migration with fixes if needed';
    RAISE NOTICE '========================================';
END $$;

-- Step 6: Optional cleanup (commented out for safety)
-- ============================================================================
-- IMPORTANT: Only drop the backup table after fully verifying the rollback
-- and confirming the application is working correctly.
--
-- DROP TABLE IF EXISTS public._migration_project_backup;
-- RAISE NOTICE 'Backup table dropped';
