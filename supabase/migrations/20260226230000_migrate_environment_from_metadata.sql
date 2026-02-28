-- Disable statement timeout for this migration — bulk UPDATE on data_records can be slow
SET statement_timeout = 0;

-- Migrate environment data from metadata JSON to environment column
-- This fixes the issue where environment is stored in metadata.environment_name or metadata.env_key
-- but the environment column has incorrect data

-- Update records where metadata has environment_name
UPDATE public.data_records
SET environment = metadata->>'environment_name'
WHERE metadata->>'environment_name' IS NOT NULL
  AND metadata->>'environment_name' != '';

-- Update records where metadata has env_key (fallback)
UPDATE public.data_records
SET environment = metadata->>'env_key'
WHERE (environment IS NULL OR environment = 'outlook' OR environment = 'default')
  AND metadata->>'env_key' IS NOT NULL
  AND metadata->>'env_key' != '';

-- For any remaining records with null environment, set to 'default'
UPDATE public.data_records
SET environment = 'default'
WHERE environment IS NULL;
