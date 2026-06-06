-- Migration 027: Workspace white-label branding (Enterprise plan)

CREATE TABLE IF NOT EXISTS workspace_branding (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  logo_url        text,
  primary_color   text DEFAULT '#8b5cf6',    -- hex color
  company_name    text,
  support_email   text,
  custom_domain   text,                       -- e.g. "builder.agency.com"
  hide_powered_by boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id)
);

ALTER TABLE workspace_branding ENABLE ROW LEVEL SECURITY;

-- Only team owners/admins can manage branding
CREATE POLICY "team admins manage branding" ON workspace_branding
  FOR ALL USING (
    team_id IN (
      SELECT team_id FROM team_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_workspace_branding_team ON workspace_branding(team_id);
