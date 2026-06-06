-- Branded app URLs: a unique vanity slug per project
-- Accessible at /app/[slug] which redirects to the project preview

alter table projects
  add column if not exists app_slug text unique;

-- Only lowercase letters, numbers, and hyphens; 3-40 chars
alter table projects
  add constraint app_slug_format check (
    app_slug is null or (
      app_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
    )
  );

create index if not exists idx_projects_app_slug on projects(app_slug) where app_slug is not null;
