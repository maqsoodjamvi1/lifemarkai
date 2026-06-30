# Integration Changes — Deploy Readiness

> One reference for everything added while mining the uploaded reference repos
> (DaveLovable, Lovable-Clone, Complete-Clone-Lovable-AI, bolt.diy) plus the
> Editor Intelligence foundation. **Every new capability is OFF by default** — deploying
> as-is changes nothing until you flip a flag. Verify with `npm run type-check`
> and `npm run build` on your machine first (the dev sandbox can't run a full
> build, and its mount truncates large files on read).

## 1. Deploy order

1. Pull / merge the changes.
2. `rm -rf .next` (clears stale generated types).
3. Apply DB migrations in order: **068 → 069 → 070 → 071 → 072** (all idempotent / `IF NOT EXISTS`).
4. `npm run type-check && npm run build`.
5. Deploy. Optionally enable features via env (section 4) one at a time.

## 2. Database migrations

| File | What it does | Risk |
|------|--------------|------|
| `068_editor_intelligence_lenses.sql` | Editor intelligence lens/run tables (`project_ai_agents`, `project_ai_agent_messages`, `project_ai_agent_decisions`, `project_ai_initiatives`, `project_ai_initiative_events`) + RLS + trigger | Additive |
| `069_domain_registrations.sql` | `domain_registrations` table + RLS; backfills `projects.custom_domain_verified` / `custom_domain_token` (`ADD COLUMN IF NOT EXISTS`) | Additive (also fixes a column the existing domain-verify route already referenced) |
| `070_seed_initial_data.sql` | (pre-existing) feature flags + starter app seed | Idempotent |
| `071_seed_starter_templates.sql` | Seeds the 6 curated design templates into the gallery (featured, public) | Idempotent |
| `072_ai_integration_openrouter_default.sql` | Sets built-app AI proxy default to `openrouter/fusion` and updates column docs | Safe default change |

## 3. What changed, by feature

### New files (additive — inert unless invoked)
- **Agent tools / intelligence:** `lib/ai/code-analyzer.ts` (TS/JS structural analysis). New tools wired in `lib/ai/agent.ts`: `edit_file`, `glob_search`, `analyze_code`, `find_definition`, `generate_image` + a write_file "File Demolition" guard.
- **Editor intelligence lenses:** `lib/ai/editor-lenses/{types,roles,orchestrator}.ts`; routes `app/api/editor-intelligence/initiative` (SSE) and `app/api/editor-intelligence/review`. **Wired into the existing Editor Intelligence panel** as the "Build with Intelligence" action (your pre-existing `/api/projects/[id]/editor-intelligence` discussion feature now executes real builds via this orchestrator; `seedAgents:false` avoids roster duplication).
- **Sandbox execution (E2B):** `lib/sandbox/index.ts`; routes `app/api/projects/[id]/sandbox-preview` (+ `/stop`); `lib/preview/use-sandbox-preview.ts`; `sandbox` tier in `lib/preview/resolve-preview-engine.ts`.
- **Image generation (Gemini/DALL-E):** `lib/ai/image-generate.ts` (shared helper) + `lib/ai/image-asset.ts` (generate→store→URL for the build agent) + runtime proxy `app/api/projects/[id]/image-proxy` for BUILT apps.
- **Design variety:** `lib/ai/design-directions.ts` — 8 curated, domain-aware design directions auto-picked per build.
- **Domains:** `lib/domains/{registrar,hosting}.ts` (not yet wired to existing domain routes — dormant).
- **Design templates:** `lib/templates/starter-catalog.ts`, `lib/ai/template-refine.ts`.
- **Prompt enhancer:** `app/api/ai/enhance/route.ts`, `lib/hooks/use-enhance-prompt.ts`.

### Changed existing files (hot paths — behavior gated by flags)
- `lib/ai/model-defaults.ts` — OpenRouter-first tiers: `openrouter/pareto-code` for coding, `openrouter/fusion` for balanced/reasoning/chat, and `deepseek/deepseek-v4-flash` for fast work. Any tier can be pinned with `OPENROUTER_*_MODEL`; native Claude/GPT/Gemini aliases still normalize to valid OpenRouter slugs.
- `lib/ai/system-prompts.ts` — (1) design system no longer forces dark; theme chosen per app. (2) E-commerce images mandatory + image-proxy usage taught. (3) agent prompt lists the new tools incl. `generate_image`.
- `components/editor/editor-intelligence-panel.tsx` — added "Build with Intelligence" (runs the orchestrator, live SSE log, real file writes) alongside the existing discussion features.
- `app/api/editor-intelligence/initiative/route.ts` — `seedAgents` flag (skip roster seeding when called from the existing panel).
- `lib/ai/provider.ts` + `lib/ai/generate.ts` — per-model output-token **clamp** (always safe; only clamps down).
- `app/api/ai/chat/route.ts` — `BUILD_MAX_TOKENS` default back to **32000** (set 64000 to opt in); reads `templateId` → appends design-refinement block in build mode.
- `app/api/ai/plan/route.ts` — plan now uses the reasoning tier + 8000 tokens (follows the model flag).
- `components/editor/chat-panel.tsx` — sends `templateId` (from `?template=` URL) on build.
- `components/editor/preview-panel.tsx` — sandbox preview auto-fetch **behind `NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW`** (off = no extra request); new `sandbox` render branch.
- `components/dashboard/prompt-create-box.tsx` — "Enhance" button + design-template picker; preselect from `?template=`.
- `components/templates/templates-grid.tsx` — design-baseline cards route to create box with template preselected.
- `gateway/src/index.ts` — added current Claude keys (native + slug) to the billing cost map.
- `CLAUDE.md` — Editor Intelligence section + model-row note.

## 4. Feature flags (all default to old behavior)

Documented in `.env.local.example`. Enable one at a time:

| Flag | Default | Enables |
|------|---------|---------|
| `BUILD_MAX_TOKENS` | `32000` | set `64000` for single-pass complete-app builds |
| `NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW` | `0` | real E2B sandbox preview (also needs `E2B_API_KEY` + `npm i @e2b/code-interpreter`) |
| `E2B_API_KEY`, `E2B_TEMPLATE` | unset | sandbox backend |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENAI_API_KEY` | unset | image generation (in-builder, build-time `generate_image`, and the built-app `image-proxy`). Without either, image features no-op gracefully. |
| `DOMAIN_REGISTRAR`, `CLOUDFLARE_*`, `IONOS_API_KEY` | unset | in-product domain purchase (UI not wired yet) |
| `OPENROUTER_*_MODEL` | unset | pin any tier to a specific model |

Always-on (no flag, but inert until used): the new agent tools (incl. `generate_image`), template picker/enhancer UI, the per-build **design-direction** auto-selection (first build only), the theme-aware design system, Editor intelligence routes + the Editor Intelligence "Build" action (run on demand), and the output-token clamp.

## 5. Rollback levers

- **Models:** set `OPENROUTER_*_MODEL` env vars to pin any tier to a specific OpenRouter slug.
- **Build size:** `BUILD_MAX_TOKENS=32000`.
- **Preview request:** `NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW=0`.
- **Editor intelligence / domains / sandbox:** leave env unset — endpoints exist but nothing calls them in core flows.
- **Code-level:** all changes are isolated; reverting any single new file or the gated blocks restores prior behavior.

## 6. Caveats to verify locally

1. **Model slug validity — RESOLVED.** `npm run verify:openrouter` checks resolver behavior and validates the shared UI + smart-routing catalogs against OpenRouter's live `/models` API.
2. **Cost** — router defaults can select premium upstream models. Credit *prices* unchanged → monitor margin and pin lower-cost tiers with `OPENROUTER_*_MODEL` when needed.
3. **No new npm deps required** — E2B loads via optional dynamic import; only install `@e2b/code-interpreter` if enabling the sandbox.
4. **Verification was per-file** — every changed file type-checks in isolation (0 errors) and a full `tsc` pass showed only mount/generated artifacts. Run the real `build` locally before shipping; `git diff` to confirm files are whole.

## 7. Not yet wired (future, optional)

- Domain purchase UI (`/api/domains/search` + `/buy` routes + Stripe `domain_purchase` webhook branch).
- Editor Intelligence panel to surface live multi-agent runs.
- Platform-owned hosting target / own SSL (P3 in `docs/editor-intelligence/09-domains-hosting.md`).
