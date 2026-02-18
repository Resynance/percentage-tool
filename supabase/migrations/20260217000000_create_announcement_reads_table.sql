-- Create announcement_reads table to track which users have read which announcements
CREATE TABLE IF NOT EXISTS public.announcement_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure each user can only mark an announcement as read once
    UNIQUE(user_id, announcement_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_announcement_reads_user_id ON public.announcement_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_announcement_id ON public.announcement_reads(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reads_read_at ON public.announcement_reads(read_at DESC);

-- Enable Row Level Security
ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own reads
CREATE POLICY "Users can view own announcement reads"
    ON public.announcement_reads
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own reads (mark as read)
CREATE POLICY "Users can mark announcements as read"
    ON public.announcement_reads
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- FLEET and ADMIN can view all reads (for analytics)
CREATE POLICY "Fleet and Admin can view all announcement reads"
    ON public.announcement_reads
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('FLEET', 'ADMIN')
        )
    );

-- Grant permissions to authenticated role
GRANT SELECT, INSERT ON public.announcement_reads TO authenticated;

-- Add comment
COMMENT ON TABLE public.announcement_reads IS 'Tracks which users have read which announcements for unread badge counts';
