-- Check distinct environment values in data_records
SELECT environment, COUNT(*) as count
FROM data_records
WHERE environment IS NOT NULL
GROUP BY environment
ORDER BY count DESC;

-- Also check metadata for environment_name field
SELECT
    metadata->>'environment_name' as metadata_env,
    COUNT(*) as count
FROM data_records
WHERE metadata->>'environment_name' IS NOT NULL
GROUP BY metadata->>'environment_name'
ORDER BY count DESC
LIMIT 20;
