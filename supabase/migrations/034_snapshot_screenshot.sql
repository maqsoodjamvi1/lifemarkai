-- Add screenshot_url to project_snapshots so history panel can show thumbnail previews
ALTER TABLE project_snapshots ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
