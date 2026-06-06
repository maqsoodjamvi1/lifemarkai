-- Element-anchored preview comments (Lovable-style)

ALTER TABLE project_comments
  ADD COLUMN IF NOT EXISTS element_xpath TEXT,
  ADD COLUMN IF NOT EXISTS element_tag TEXT,
  ADD COLUMN IF NOT EXISTS page_path TEXT,
  ADD COLUMN IF NOT EXISTS element_preview TEXT;

CREATE INDEX IF NOT EXISTS project_comments_element_idx
  ON project_comments (project_id, page_path)
  WHERE element_xpath IS NOT NULL;

COMMENT ON COLUMN project_comments.element_xpath IS
  'XPath of the preview element this comment is pinned to.';
COMMENT ON COLUMN project_comments.page_path IS
  'Preview route/path when the comment was created (e.g. /dashboard).';
