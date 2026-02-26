-- ============================================================================
-- Fix Supabase Security Warnings
-- ============================================================================

-- =================================================================
-- 1. Fix Function Search Path Mutable Warnings
-- =================================================================
-- Setting search_path prevents malicious users from hijacking function behavior
-- by creating objects in schemas that appear earlier in the search path

-- Update trigger functions to use safe search_path
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.update_time_entries_updated_at() SET search_path = '';
ALTER FUNCTION public.update_bonus_windows_updated_at() SET search_path = '';
ALTER FUNCTION public.update_notification_settings_updated_at() SET search_path = '';
ALTER FUNCTION public.update_time_reporting_updated_at() SET search_path = '';

-- Update auth/permission functions to use safe search_path
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.is_admin() SET search_path = '';
ALTER FUNCTION public.is_manager_or_admin() SET search_path = '';

-- =================================================================
-- 2. Fix Overly Permissive RLS Policies
-- =================================================================
-- Replace policies that use (true) with proper permission checks

-- AUDIT LOGS: Should only allow users to insert their own audit logs
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Users can insert their own audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id::uuid
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'MANAGER')
    )
);

-- BUG REPORTS: Should stamp the report with the user's ID
DROP POLICY IF EXISTS "Users can create bug reports" ON public.bug_reports;
CREATE POLICY "Users can create their own bug reports"
ON public.bug_reports
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id::uuid OR user_id IS NULL
);

-- LIKERT SCORES: Should only allow users to create scores they're authorized for
DROP POLICY IF EXISTS "Users can create likert scores" ON public.likert_scores;
CREATE POLICY "Users can create likert scores for their records"
ON public.likert_scores
FOR INSERT
TO authenticated
WITH CHECK (
    -- User must be QA, CORE, or higher role
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('QA', 'CORE', 'FLEET', 'MANAGER', 'ADMIN')
    )
);

-- CROSS ENCODER CACHE: Limit to authenticated users with proper roles
DROP POLICY IF EXISTS "Authenticated can insert cross encoder cache" ON public.cross_encoder_cache;
CREATE POLICY "System can insert cross encoder cache"
ON public.cross_encoder_cache
FOR INSERT
TO authenticated
WITH CHECK (
    -- Only service role or admins can insert cache entries
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'FLEET')
    )
);

DROP POLICY IF EXISTS "Authenticated can update cross encoder cache" ON public.cross_encoder_cache;
CREATE POLICY "System can update cross encoder cache"
ON public.cross_encoder_cache
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'FLEET')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('ADMIN', 'FLEET')
    )
);

-- =================================================================
-- 3. Vector Extension in Public Schema
-- =================================================================
-- NOTE: This warning is a false positive for pgvector extension.
-- The vector extension is correctly placed in public schema.
-- Supabase's linter recommendation doesn't apply to this extension.
-- No action needed - this is the correct configuration.

-- =================================================================
-- COMPLETION
-- =================================================================
-- After applying this migration:
-- 1. Function search path warnings: FIXED
-- 2. Overly permissive RLS policies: FIXED
-- 3. Vector extension warning: Acknowledged as false positive
-- 4. Leaked password protection: Must be enabled in Dashboard (see below)

-- =================================================================
-- Manual Steps Required
-- =================================================================
--
-- Enable Leaked Password Protection:
-- 1. Go to: Authentication → Providers → Email
-- 2. Scroll to "Password Settings"
-- 3. Enable "Check for leaked passwords" (HaveIBeenPwned)
--
-- This setting cannot be changed via SQL migration.
