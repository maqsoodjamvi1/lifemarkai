-- Migration 071: seed the curated starter design templates into the gallery.
-- These mirror lib/templates/starter-catalog.ts (the design baselines the build
-- prompt refines). Seeded as featured, public gallery cards for discovery.
-- Idempotent: re-runnable, inserts each only if its name isn't already present.

INSERT INTO templates (id, name, description, category, preview_url, files, is_featured, is_public, created_at)
SELECT gen_random_uuid(), t.name, t.description, t.category, NULL, '[]'::jsonb, TRUE, TRUE, NOW()
FROM (VALUES
  ('Aurora — Modern SaaS',        'Gradient-accented SaaS landing: hero, social proof, features, pricing, FAQ, CTA. Dark, premium, spacious.', 'saas'),
  ('Monogram — Minimal Portfolio','Editorial, typography-led personal portfolio. Serif display, lots of whitespace, calm.',                      'portfolio'),
  ('Bazaar — Storefront',         'Clean product-first storefront: category nav, product grid, reviews, newsletter. Trustworthy + clean.',       'ecommerce'),
  ('Pulse — Analytics Dashboard', 'App shell with sidebar, KPI cards, charts, and a data table. Dark, data-dense, professional.',                 'dashboard'),
  ('Vertex — Creative Agency',    'Bold, motion-friendly agency site: oversized type, case studies, services. Expressive, lime accent.',         'agency'),
  ('Quill — Editorial Blog',      'Readable content-first blog: featured post, category filter, article cards. Warm, editorial, serif.',         'blog')
) AS t(name, description, category)
WHERE NOT EXISTS (SELECT 1 FROM templates WHERE templates.name = t.name);
