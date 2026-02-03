-- Remove restrictive update policy to allow collaborative scoring
-- However, application does not actually use UPDATE operations
-- (uses CREATE for initial scoring and SELECT for viewing)
-- No UPDATE policy is needed - removes unnecessary security exposure

DROP POLICY IF EXISTS "Users can update own likert scores" ON public.likert_scores;
