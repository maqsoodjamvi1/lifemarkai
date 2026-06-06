-- Migration 003: Additional fixes and enhancements

-- Add missing onboarding_complete column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN DEFAULT FALSE;

-- Add slug column to projects for public URL routing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Add metadata JSONB to projects if not present
ALTER TABLE projects ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add slug computed column for projects (use name-based slug + id suffix)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug TEXT;

-- Add RLS policy for deployments (missing from migration 001)
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deployments_owner" ON deployments;
CREATE POLICY "deployments_owner" ON deployments
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "deployments_project_collaborator" ON deployments;
CREATE POLICY "deployments_project_collaborator" ON deployments
  FOR SELECT USING (
    project_id IN (
      SELECT project_id FROM collaborators WHERE user_id = auth.uid()
    )
  );

-- Add missing indexes
CREATE INDEX IF NOT EXISTS deployments_project_id ON deployments (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deployments_user_id ON deployments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS collaborators_user_id ON collaborators (user_id);
CREATE INDEX IF NOT EXISTS collaborators_project_id ON collaborators (project_id);

-- Update deduct_credits function to include description parameter
CREATE OR REPLACE FUNCTION deduct_credits(
  user_id UUID,
  amount INTEGER,
  action TEXT,
  project_id UUID DEFAULT NULL,
  description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT credits INTO current_credits FROM profiles WHERE id = user_id FOR UPDATE;

  IF current_credits < amount THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET credits = credits - amount WHERE id = user_id;

  INSERT INTO credit_logs (user_id, amount, action, project_id, description)
  VALUES (user_id, -amount, action, project_id, description);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add credits (for purchases and topups)
CREATE OR REPLACE FUNCTION add_credits(
  user_id UUID,
  amount INTEGER,
  action TEXT DEFAULT 'purchase',
  description TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE profiles SET credits = credits + amount WHERE id = user_id;

  INSERT INTO credit_logs (user_id, amount, action, description)
  VALUES (user_id, amount, action, description);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment fork count function for templates
CREATE OR REPLACE FUNCTION increment_fork_count(template_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE templates SET fork_count = fork_count + 1 WHERE id = template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-set project slug on insert
CREATE OR REPLACE FUNCTION set_project_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL THEN
    NEW.slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || SUBSTRING(NEW.id::TEXT, 1, 6);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS project_slug_trigger ON projects;
CREATE TRIGGER project_slug_trigger
  BEFORE INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION set_project_slug();

-- Public project policy using slug
DROP POLICY IF EXISTS "projects_public_view" ON projects;
CREATE POLICY "projects_public_view" ON projects
  FOR SELECT USING (is_public = TRUE);

-- Description field on credit_logs (if missing)
ALTER TABLE credit_logs ADD COLUMN IF NOT EXISTS description TEXT;
