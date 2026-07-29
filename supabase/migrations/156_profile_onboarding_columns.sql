-- Add the profile columns the onboarding wizard has always written but that
-- were never created.
--
-- WHY THIS IS A BUG, NOT A NICETY
-- -------------------------------
-- components/onboarding/workspace-setup-wizard.tsx does ONE update:
--
--   .update({ workspace_name, preferred_framework, ai_style,
--             onboarding_complete: true, setup_complete: true })
--
-- Only `onboarding_complete` existed. PostgREST rejects an update that names an
-- unknown column, so the ENTIRE statement failed — including the one column that
-- did exist. The call site wraps it in `catch { /* silent */ }` and then shows
-- "Workspace configured!" regardless, so the failure was invisible.
--
-- routes/_dashboard/dashboard.tsx gates the wizard on `!profile.setup_complete`.
-- Because that column never existed, the flag could never be set, so the setup
-- wizard re-appeared on every dashboard visit and could never be completed.
--
-- Adding the columns makes the write succeed, which both fixes the loop and
-- makes `preferred_framework` real — lib/server-fns/projects.ts now reads it as
-- the per-user default for new projects.
--
-- NOTE: preferred_framework is deliberately NOT constrained to the
-- projects_framework_check list. The wizard also offers "astro" and "remix",
-- which are not creatable project frameworks; createProject whitelists the value
-- before using it and falls back to the default. Storing the user's honest
-- answer is still useful signal for AI prompting.

alter table public.profiles
  add column if not exists workspace_name      text,
  add column if not exists preferred_framework text,
  add column if not exists ai_style            text,
  add column if not exists setup_complete      boolean not null default false;

-- Existing users have already been through (or skipped past) onboarding; do not
-- resurface the wizard for them just because the column is new.
update public.profiles
   set setup_complete = true
 where onboarding_complete = true
   and setup_complete = false;

comment on column public.profiles.workspace_name      is 'Display name chosen in the onboarding setup wizard.';
comment on column public.profiles.preferred_framework is 'Preferred framework from onboarding. Used as the per-user default in createProject when the client does not send one; validated against the allowed set first.';
comment on column public.profiles.ai_style            is 'AI response style preference: concise | detailed | creative.';
comment on column public.profiles.setup_complete      is 'True once the setup wizard has been completed or skipped. Gates the wizard in the dashboard.';
