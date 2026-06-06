-- Migration 002: Add metadata column to projects + enhancements

-- Add metadata JSONB column to projects for storing integration config
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add username to profiles for public profile URLs
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add credits_remaining as an alias / computed approach
-- (credits field already exists in migration 001, this ensures column exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'credits'
  ) THEN
    ALTER TABLE profiles ADD COLUMN credits INTEGER DEFAULT 100;
  END IF;
END $$;

-- Add github_access_token column
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS github_access_token TEXT;

-- Add deployment logs table for more granular build tracking
CREATE TABLE IF NOT EXISTS deployment_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  level TEXT DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'success')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deployment_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs for their deployments" ON deployment_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM deployments d
      JOIN projects p ON d.project_id = p.id
      WHERE d.id = deployment_id AND p.user_id = auth.uid()
    )
  );

-- Add analytics_events table for tracking app usage
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own events" ON analytics_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own events" ON analytics_events
  FOR SELECT USING (auth.uid() = user_id);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS analytics_events_user_created ON analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_project ON analytics_events (project_id, created_at DESC);

-- Index for project files path lookups
CREATE INDEX IF NOT EXISTS project_files_path ON project_files (project_id, path);

-- Index for messages ordering
CREATE INDEX IF NOT EXISTS messages_project_created ON messages (project_id, created_at ASC);

-- Function to get user stats
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE (
  total_projects BIGINT,
  live_projects BIGINT,
  total_messages BIGINT,
  total_deployments BIGINT,
  credits_used BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM projects WHERE user_id = p_user_id) AS total_projects,
    (SELECT COUNT(*) FROM projects WHERE user_id = p_user_id AND status = 'live') AS live_projects,
    (SELECT COUNT(*) FROM messages m JOIN projects p ON m.project_id = p.id WHERE p.user_id = p_user_id) AS total_messages,
    (SELECT COUNT(*) FROM deployments WHERE user_id = p_user_id) AS total_deployments,
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM credit_logs WHERE user_id = p_user_id AND amount < 0) AS credits_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
