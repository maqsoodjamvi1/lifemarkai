-- Migration 072: default built-app AI proxy to the OpenRouter router.
-- Existing explicit project choices are preserved; this only changes the
-- column default for new projects/integrations and refreshes the column docs.

ALTER TABLE projects
  ALTER COLUMN ai_integration_model SET DEFAULT 'openrouter/fusion';

COMMENT ON COLUMN projects.ai_integration_model IS
  'OpenRouter model slug to use for AI proxy calls (default openrouter/fusion; can be any valid provider/model slug)';
