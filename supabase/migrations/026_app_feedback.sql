-- Migration 026: App feedback — embeddable feedback widget for published apps

CREATE TABLE IF NOT EXISTS app_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rating      integer CHECK (rating BETWEEN 1 AND 5),
  message     text,
  page_url    text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_feedback ENABLE ROW LEVEL SECURITY;

-- Project owner reads all feedback for their projects
CREATE POLICY "owner reads feedback" ON app_feedback
  FOR SELECT USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

-- Anonymous inserts allowed (public feedback submissions)
CREATE POLICY "public submit feedback" ON app_feedback
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_app_feedback_project ON app_feedback(project_id, created_at DESC);
