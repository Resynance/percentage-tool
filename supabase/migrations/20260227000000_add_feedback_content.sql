-- Add feedback_content column to qa_feedback_ratings table
ALTER TABLE public.qa_feedback_ratings
ADD COLUMN IF NOT EXISTS feedback_content TEXT;

COMMENT ON COLUMN public.qa_feedback_ratings.feedback_content IS 'The actual feedback text content';
