-- ============================================================================
-- VERIFY PROJECT TO ENVIRONMENT MIGRATION
-- ============================================================================
-- This script checks data integrity before and after the migration.
-- Run this script BEFORE migration to identify potential issues.
-- Run this script AFTER migration to verify success.
--
-- The script does NOT modify any data - it only reports statistics.
-- ============================================================================

-- Step 1: Count total records
-- ============================================================================
DO $$
DECLARE
    total_records INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_records FROM public.data_records;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION VERIFICATION REPORT';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total data_records: %', total_records;
    RAISE NOTICE '';
END $$;

-- Step 2: Check project_id status (pre-migration)
-- ============================================================================
DO $$
DECLARE
    records_with_project INTEGER;
    records_without_project INTEGER;
    unique_projects INTEGER;
BEGIN
    -- Count records with project_id
    SELECT COUNT(*) INTO records_with_project
    FROM public.data_records
    WHERE project_id IS NOT NULL;

    -- Count records without project_id (orphaned)
    SELECT COUNT(*) INTO records_without_project
    FROM public.data_records
    WHERE project_id IS NULL;

    -- Count unique projects
    SELECT COUNT(DISTINCT project_id) INTO unique_projects
    FROM public.data_records
    WHERE project_id IS NOT NULL;

    RAISE NOTICE 'PROJECT_ID STATUS:';
    RAISE NOTICE '  Records with project_id: %', records_with_project;
    RAISE NOTICE '  Records without project_id (orphaned): %', records_without_project;
    RAISE NOTICE '  Unique project_id values: %', unique_projects;
    RAISE NOTICE '';
END $$;

-- Step 3: Check environment status (post-migration)
-- ============================================================================
DO $$
DECLARE
    records_with_environment INTEGER;
    records_without_environment INTEGER;
    unique_environments INTEGER;
    orphaned_migrated INTEGER;
    unknown_migrated INTEGER;
BEGIN
    -- Count records with environment
    SELECT COUNT(*) INTO records_with_environment
    FROM public.data_records
    WHERE environment IS NOT NULL AND environment != '';

    -- Count records without environment
    SELECT COUNT(*) INTO records_without_environment
    FROM public.data_records
    WHERE environment IS NULL OR environment = '';

    -- Count unique environments
    SELECT COUNT(DISTINCT environment) INTO unique_environments
    FROM public.data_records
    WHERE environment IS NOT NULL AND environment != '';

    -- Count special migration markers
    SELECT COUNT(*) INTO orphaned_migrated
    FROM public.data_records
    WHERE environment = 'migrated-orphaned';

    SELECT COUNT(*) INTO unknown_migrated
    FROM public.data_records
    WHERE environment LIKE 'migrated-unknown-%';

    RAISE NOTICE 'ENVIRONMENT STATUS:';
    RAISE NOTICE '  Records with environment: %', records_with_environment;
    RAISE NOTICE '  Records without environment: %', records_without_environment;
    RAISE NOTICE '  Unique environment values: %', unique_environments;
    IF orphaned_migrated > 0 THEN
        RAISE NOTICE '  Records marked "migrated-orphaned": %', orphaned_migrated;
    END IF;
    IF unknown_migrated > 0 THEN
        RAISE NOTICE '  Records marked "migrated-unknown-*": %', unknown_migrated;
    END IF;
    RAISE NOTICE '';
END $$;

-- Step 4: Check for records with invalid project references
-- ============================================================================
DO $$
DECLARE
    invalid_project_refs INTEGER;
BEGIN
    -- Count records with project_id but no matching project
    SELECT COUNT(*) INTO invalid_project_refs
    FROM public.data_records dr
    LEFT JOIN public.projects p ON dr.project_id = p.id
    WHERE dr.project_id IS NOT NULL
    AND p.id IS NULL;

    IF invalid_project_refs > 0 THEN
        RAISE WARNING 'Found % records with project_id but no matching project!', invalid_project_refs;
        RAISE NOTICE 'These will be migrated as "migrated-unknown-{project_id}"';
    ELSE
        RAISE NOTICE 'PROJECT INTEGRITY: All project_id references are valid';
    END IF;
    RAISE NOTICE '';
END $$;

-- Step 5: Show sample project → environment mapping (pre-migration)
-- ============================================================================
DO $$
DECLARE
    mapping_record RECORD;
    counter INTEGER := 0;
BEGIN
    RAISE NOTICE 'SAMPLE PROJECT → ENVIRONMENT MAPPING:';

    FOR mapping_record IN
        SELECT
            p.id as project_id,
            p.name as project_name,
            COUNT(dr.id) as record_count
        FROM public.projects p
        LEFT JOIN public.data_records dr ON dr.project_id = p.id
        GROUP BY p.id, p.name
        ORDER BY record_count DESC
        LIMIT 10
    LOOP
        counter := counter + 1;
        RAISE NOTICE '  %: Project "%" (id: %) → % records',
            counter,
            mapping_record.project_name,
            mapping_record.project_id,
            mapping_record.record_count;
    END LOOP;

    IF counter = 0 THEN
        RAISE NOTICE '  (No projects found)';
    END IF;
    RAISE NOTICE '';
END $$;

-- Step 6: Show sample environment distribution (post-migration)
-- ============================================================================
DO $$
DECLARE
    env_record RECORD;
    counter INTEGER := 0;
BEGIN
    RAISE NOTICE 'ENVIRONMENT DISTRIBUTION:';

    FOR env_record IN
        SELECT
            environment,
            COUNT(*) as record_count
        FROM public.data_records
        WHERE environment IS NOT NULL AND environment != ''
        GROUP BY environment
        ORDER BY record_count DESC
        LIMIT 10
    LOOP
        counter := counter + 1;
        RAISE NOTICE '  %: Environment "%" → % records',
            counter,
            env_record.environment,
            env_record.record_count;
    END LOOP;

    IF counter = 0 THEN
        RAISE NOTICE '  (No environments found)';
    END IF;
    RAISE NOTICE '';
END $$;

-- Step 7: Check backup table status (post-migration)
-- ============================================================================
DO $$
DECLARE
    backup_exists BOOLEAN;
    backup_count INTEGER := 0;
BEGIN
    -- Check if backup table exists
    SELECT EXISTS (
        SELECT FROM pg_tables
        WHERE schemaname = 'public'
        AND tablename = '_migration_project_backup'
    ) INTO backup_exists;

    IF backup_exists THEN
        SELECT COUNT(*) INTO backup_count FROM public._migration_project_backup;
        RAISE NOTICE 'BACKUP TABLE STATUS:';
        RAISE NOTICE '  Backup table exists: YES';
        RAISE NOTICE '  Records in backup: %', backup_count;
    ELSE
        RAISE NOTICE 'BACKUP TABLE STATUS:';
        RAISE NOTICE '  Backup table exists: NO';
        RAISE NOTICE '  (Backup table is created during migration)';
    END IF;
    RAISE NOTICE '';
END $$;

-- Step 8: Migration readiness assessment
-- ============================================================================
DO $$
DECLARE
    total_records INTEGER;
    records_without_env INTEGER;
    invalid_refs INTEGER;
    is_ready BOOLEAN := true;
    issues TEXT := '';
BEGIN
    -- Get counts
    SELECT COUNT(*) INTO total_records FROM public.data_records;
    SELECT COUNT(*) INTO records_without_env
    FROM public.data_records
    WHERE environment IS NULL OR environment = '';

    SELECT COUNT(*) INTO invalid_refs
    FROM public.data_records dr
    LEFT JOIN public.projects p ON dr.project_id = p.id
    WHERE dr.project_id IS NOT NULL AND p.id IS NULL;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION READINESS ASSESSMENT';
    RAISE NOTICE '========================================';

    -- Check if migration is needed
    IF records_without_env = 0 AND total_records > 0 THEN
        RAISE NOTICE 'STATUS: Migration appears to be COMPLETE';
        RAISE NOTICE 'All % records have environment values', total_records;
    ELSIF total_records = 0 THEN
        RAISE NOTICE 'STATUS: No data_records found';
        RAISE NOTICE 'Migration not needed (empty table)';
    ELSE
        RAISE NOTICE 'STATUS: Migration NEEDED';
        RAISE NOTICE '% records need environment values', records_without_env;

        IF invalid_refs > 0 THEN
            RAISE NOTICE '';
            RAISE WARNING 'ISSUE: % records have invalid project references', invalid_refs;
            RAISE NOTICE 'These will be migrated as "migrated-unknown-{project_id}"';
        END IF;
    END IF;

    RAISE NOTICE '========================================';
END $$;

-- Step 9: Final summary
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE 'VERIFICATION COMPLETE';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Review the output above for any warnings or issues';
    RAISE NOTICE '2. If pre-migration: Run migration script';
    RAISE NOTICE '3. If post-migration: Test application functionality';
    RAISE NOTICE '4. Keep backup table for at least 30 days';
    RAISE NOTICE '';
END $$;
