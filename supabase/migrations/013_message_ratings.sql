-- Add rating column to messages table for thumbs up/down feedback
ALTER TABLE messages ADD COLUMN IF NOT EXISTS rating SMALLINT DEFAULT NULL CHECK (rating IN (-1, 1));

-- Index for analytics (e.g. average rating per project)
CREATE INDEX IF NOT EXISTS idx_messages_rating ON messages (project_id, rating) WHERE rating IS NOT NULL;
