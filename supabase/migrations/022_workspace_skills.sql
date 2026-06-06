-- Migration 022: Workspace Skills
-- Reusable AI instruction playbooks shared across all projects in a workspace

CREATE TABLE IF NOT EXISTS workspace_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  prompt      TEXT NOT NULL,
  icon        TEXT DEFAULT '⚡',   -- emoji icon
  tags        TEXT[] DEFAULT '{}',
  use_count   INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast per-user lookups, sorted by use
CREATE INDEX IF NOT EXISTS workspace_skills_user_idx
  ON workspace_skills (user_id, use_count DESC, created_at DESC);

-- RLS
ALTER TABLE workspace_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "skills_owner" ON workspace_skills
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_workspace_skills_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_skills_updated_at ON workspace_skills;
CREATE TRIGGER workspace_skills_updated_at
  BEFORE UPDATE ON workspace_skills
  FOR EACH ROW EXECUTE FUNCTION update_workspace_skills_updated_at();

-- Seed a few built-in starter skills (inserted as system user — apps can filter user_id IS NULL)
-- These are read-only templates shown to all users in the picker
CREATE TABLE IF NOT EXISTS builtin_skills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  prompt      TEXT NOT NULL,
  icon        TEXT DEFAULT '⚡',
  tags        TEXT[] DEFAULT '{}',
  sort_order  INT DEFAULT 0
);

INSERT INTO builtin_skills (name, description, prompt, icon, tags, sort_order) VALUES
  ('Add Dark Mode', 'Add a light/dark theme toggle using CSS variables or Tailwind dark: classes', 'Add a complete dark mode implementation. Use a theme context/provider with a toggle button. If using Tailwind, add the `dark:` variant classes. If using plain CSS, use CSS custom properties. Persist the preference in localStorage. Make sure all components respect the theme.', '🌙', ARRAY['ui', 'theme'], 1),
  ('Add Stripe Payments', 'Integrate Stripe checkout for one-time or subscription payments', 'Integrate Stripe into this app. Add a Stripe checkout session endpoint, a pricing page with plan cards, and a success/cancel redirect flow. Use Stripe''s hosted checkout page. Store the customer and subscription IDs. Add a simple billing page showing the current plan.', '💳', ARRAY['payments', 'stripe'], 2),
  ('SEO Optimize', 'Add meta tags, Open Graph, sitemap, and structured data', 'Fully SEO-optimize this app. Add a <Head> component with dynamic title, description, canonical URL, Open Graph (og:title, og:description, og:image), Twitter card meta tags. Add a sitemap.xml and robots.txt. Add JSON-LD structured data for the main page type. Make titles and descriptions descriptive and unique per page.', '🔍', ARRAY['seo', 'marketing'], 3),
  ('Add Authentication', 'Add email + social login with protected routes', 'Add a complete authentication system. Include email/password signup and login, Google OAuth, protected routes that redirect unauthenticated users, a user profile dropdown in the navbar, and a logout button. Use a session/auth context provider to expose the current user throughout the app.', '🔐', ARRAY['auth', 'security'], 4),
  ('Add Analytics', 'Integrate Plausible or PostHog for privacy-friendly analytics', 'Integrate analytics into this app using PostHog (privacy-friendly). Add the PostHog script to the app shell, track pageviews automatically on route changes, and add event tracking for key user actions (button clicks, form submissions). Add an environment variable NEXT_PUBLIC_POSTHOG_KEY. Do not track PII.', '📊', ARRAY['analytics', 'tracking'], 5),
  ('Responsive Mobile Layout', 'Make the app fully responsive for phones and tablets', 'Make this app fully responsive. Audit every page and component for mobile breakpoints. Use Tailwind responsive prefixes (sm:, md:, lg:). Add a mobile hamburger nav menu. Fix any overflow issues. Test at 375px, 768px, and 1280px widths. Ensure tap targets are at least 44px. Fix any text that''s too small on mobile.', '📱', ARRAY['ui', 'responsive'], 6),
  ('Add Toast Notifications', 'Add a toast/snackbar notification system', 'Add a toast notification system to this app. Use a toast context/provider with a useToast() hook. Support success, error, warning, and info variants. Show toasts in the top-right corner with a slide-in animation and auto-dismiss after 4 seconds. Add a dismiss button. Wire toast calls into all existing API calls and form submissions.', '🔔', ARRAY['ui', 'ux'], 7),
  ('Add Loading Skeletons', 'Replace spinners with skeleton loading states for all data', 'Replace all loading spinners with skeleton loading states. Use a pulsing gray placeholder that matches the shape of the loaded content. Add skeletons to every list, card, table, and detail view that fetches async data. Use CSS animation (animate-pulse in Tailwind or a custom keyframe). Make sure skeletons match the exact dimensions of the real content.', '💀', ARRAY['ui', 'ux'], 8),
  ('Add Form Validation', 'Add Zod schema validation + inline error messages to all forms', 'Add comprehensive form validation to all forms in this app. Use Zod for schema definition and react-hook-form for form state. Show inline error messages below each field. Validate on blur and on submit. Add required field indicators. Prevent submission when invalid. Show a success state after successful submission.', '✅', ARRAY['forms', 'validation'], 9),
  ('Add Keyboard Shortcuts', 'Add keyboard shortcuts with a help modal (? to open)', 'Add keyboard shortcuts throughout the app. Press ? to open a shortcuts help modal. Add at minimum: ⌘K for command palette/search, ⌘/ for help, Escape to close modals. List all shortcuts in a well-organized modal grouped by category. Use a global keydown event listener with proper cleanup.', '⌨️', ARRAY['ux', 'accessibility'], 10)
ON CONFLICT DO NOTHING;
