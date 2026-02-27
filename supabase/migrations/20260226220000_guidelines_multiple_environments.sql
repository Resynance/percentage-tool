-- Change guidelines.environment from single string to array
-- This allows one guideline to be associated with multiple environments

-- Step 1: Add new environments column (array)
ALTER TABLE public.guidelines
ADD COLUMN IF NOT EXISTS environments TEXT[] DEFAULT '{}';

-- Step 2: Migrate existing data (convert single environment to array)
UPDATE public.guidelines
SET environments = CASE
    WHEN environment IS NOT NULL THEN ARRAY[environment]
    ELSE '{}'::TEXT[]
END;

-- Step 3: Drop old environment column
ALTER TABLE public.guidelines
DROP COLUMN IF EXISTS environment;

-- Step 4: Drop old index
DROP INDEX IF EXISTS public.guidelines_environment_idx;

-- Note: Removed environment index since array field indexing is different
-- If needed, can add GIN index: CREATE INDEX guidelines_environments_idx ON public.guidelines USING GIN (environments);
