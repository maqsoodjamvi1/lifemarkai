-- Migration 070: Idempotent seed data (feature flags, starter template)

-- Feature flags: safe to re-run
INSERT INTO feature_flags(key, name, description, is_enabled, rollout_pct, allowed_plans, created_at, updated_at)
SELECT f.key, f.name, f.description, f.is_enabled, f.rollout_pct, f.allowed_plans::jsonb, NOW(), NOW()
FROM (VALUES
  ('welcome_banner','Welcome Banner','Show a welcome banner to new users',TRUE,100,'[]'::text),
  ('default_template_starter','Starter Template','A minimal starter project template',TRUE,100,'[]'::text)
) AS f(key,name,description,is_enabled,rollout_pct,allowed_plans)
WHERE NOT EXISTS (SELECT 1 FROM feature_flags WHERE key = f.key);

-- Ensure a simple public starter template exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM templates WHERE name = 'Starter App') THEN
    INSERT INTO templates (id, name, description, category, preview_url, files, is_featured, is_public, created_at)
    VALUES (
      gen_random_uuid(),
      'Starter App',
      'A minimal starter template for new projects',
      'starter',
      NULL,
      '[]'::jsonb,
      FALSE,
      TRUE,
      NOW()
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Lightweight sample job_queue entry (optional)
INSERT INTO job_queue (id, type, status, priority, payload, scheduled_at, created_at)
SELECT gen_random_uuid(), 'seed.sample', 'done', 5, '{}'::jsonb, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM job_queue WHERE type = 'seed.sample');
