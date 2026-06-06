# Applying migration 054 — visitor UA + path columns

This migration adds two columns each to `project_views` and `app_visitors` so the
new Lovable-style site analytics panel can render Source / Page / Device
breakdown tiles. It is **safe to run on a live database** — all new columns are
nullable, and only partial indexes are added.

## What it changes

```sql
ALTER TABLE project_views
  ADD COLUMN IF NOT EXISTS path       TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE app_visitors
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS project_views_project_path_idx
  ON project_views (project_id, path)
  WHERE path IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_views_project_referrer_idx
  ON project_views (project_id, referrer)
  WHERE referrer IS NOT NULL;
```

No existing rows are modified. Existing reads continue to work — the new
columns just appear as `NULL` for old rows.

## Option A — Supabase CLI (preferred)

```powershell
cd D:\Projects\lifemarkai
supabase db push
```

This picks up every migration in `supabase/migrations` that hasn't been applied
to the linked project yet. Migration 054 will be the only one applied if your
local state was current as of migration 053.

If `supabase db push` reports that migration history is divergent, run
`supabase db pull` first to fast-forward your local copy.

## Option B — Dashboard SQL editor

1. Open https://supabase.com/dashboard/project/_/sql/new
2. Paste the contents of `054_visitor_ua_path.sql`
3. Click Run

## Option C — psql, if you have direct DB access

```powershell
psql "$env:SUPABASE_DB_URL" -f supabase/migrations/054_visitor_ua_path.sql
```

## Verifying

After applying, this query should show four new columns:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE (table_name = 'project_views' AND column_name IN ('path', 'user_agent'))
   OR (table_name = 'app_visitors'  AND column_name = 'user_agent');
```

Expected: three rows (project_views.path, project_views.user_agent,
app_visitors.user_agent).

## Rollback

The migration is additive only. To revert:

```sql
DROP INDEX IF EXISTS project_views_project_path_idx;
DROP INDEX IF EXISTS project_views_project_referrer_idx;
ALTER TABLE project_views DROP COLUMN IF EXISTS path;
ALTER TABLE project_views DROP COLUMN IF EXISTS user_agent;
ALTER TABLE app_visitors  DROP COLUMN IF EXISTS user_agent;
```

The new analytics panel falls back gracefully when the columns are missing
(Source / Page / Device tiles render with "No data yet"), so a rollback is
non-breaking for the editor UI.
