-- ============================================
-- LifemarkAI Initial Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES (extends auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business', 'enterprise')),
  credits INTEGER NOT NULL DEFAULT 5,
  credits_reset_at TIMESTAMPTZ,
  github_username TEXT,
  github_access_token TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- PROJECTS
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT NOT NULL DEFAULT 'react' CHECK (framework IN ('react', 'next', 'vue', 'svelte')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'building')),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  preview_url TEXT,
  deployed_url TEXT,
  github_repo TEXT,
  github_branch TEXT,
  supabase_project_url TEXT,
  template_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_status ON projects(status);

-- ============================================
-- PROJECT FILES
-- ============================================
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'plaintext',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(project_id, path)
);

CREATE INDEX idx_project_files_project_id ON project_files(project_id);

-- ============================================
-- MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INTEGER,
  model TEXT,
  mode TEXT DEFAULT 'chat' CHECK (mode IN ('chat', 'agent', 'plan', 'build')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_messages_project_id ON messages(project_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================
-- DEPLOYMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'building' CHECK (status IN ('building', 'live', 'failed', 'cancelled')),
  provider TEXT NOT NULL DEFAULT 'lifemarkai' CHECK (provider IN ('lifemarkai', 'vercel', 'netlify', 'railway')),
  provider_deployment_id TEXT,
  build_log TEXT,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_deployments_project_id ON deployments(project_id);

-- ============================================
-- COLLABORATORS
-- ============================================
CREATE TABLE IF NOT EXISTS collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID NOT NULL REFERENCES profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  accepted_at TIMESTAMPTZ,
  UNIQUE(project_id, user_id)
);

-- ============================================
-- TEMPLATES
-- ============================================
CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  preview_url TEXT,
  files JSONB NOT NULL DEFAULT '[]',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  fork_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_templates_category ON templates(category);
CREATE INDEX idx_templates_is_featured ON templates(is_featured);

-- ============================================
-- CREDIT LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS credit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  action TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_credit_logs_user_id ON credit_logs(user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Deduct credits safely
CREATE OR REPLACE FUNCTION deduct_credits(
  user_id UUID,
  amount INTEGER,
  action TEXT,
  project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT credits INTO current_credits FROM profiles WHERE id = user_id FOR UPDATE;

  IF current_credits < amount THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET credits = credits - amount, updated_at = NOW() WHERE id = user_id;

  INSERT INTO credit_logs (user_id, amount, action, project_id)
  VALUES (user_id, -amount, action, project_id);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reset daily credits for free users
CREATE OR REPLACE FUNCTION reset_free_credits()
RETURNS void AS $$
BEGIN
  UPDATE profiles
  SET credits = 5, credits_reset_at = NOW(), updated_at = NOW()
  WHERE plan = 'free'
    AND (credits_reset_at IS NULL OR credits_reset_at < NOW() - INTERVAL '24 hours');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_project_files_updated_at BEFORE UPDATE ON project_files FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see/edit their own
CREATE POLICY "profiles_self" ON profiles FOR ALL USING (auth.uid() = id);

-- Projects: owner + collaborators
CREATE POLICY "projects_owner" ON projects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "projects_collaborator" ON projects FOR SELECT
  USING (id IN (SELECT project_id FROM collaborators WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));
CREATE POLICY "projects_public" ON projects FOR SELECT USING (is_public = TRUE);

-- Project files: same as projects
CREATE POLICY "files_owner" ON project_files FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));
CREATE POLICY "files_collaborator" ON project_files FOR SELECT
  USING (project_id IN (SELECT project_id FROM collaborators WHERE user_id = auth.uid() AND accepted_at IS NOT NULL));

-- Messages
CREATE POLICY "messages_owner" ON messages FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()));

-- Deployments
CREATE POLICY "deployments_owner" ON deployments FOR ALL USING (auth.uid() = user_id);

-- Templates: public templates visible to all
CREATE POLICY "templates_public" ON templates FOR SELECT USING (is_public = TRUE);
CREATE POLICY "templates_owner" ON templates FOR ALL USING (auth.uid() = created_by);

-- Credit logs: users see their own
CREATE POLICY "credit_logs_self" ON credit_logs FOR SELECT USING (auth.uid() = user_id);
