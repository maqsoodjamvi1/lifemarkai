# Integration Changes — Deploy Readiness

> One reference for everything added while mining the uploaded reference repos
> (DaveLovable, Lovable-Clone, Complete-Clone-Lovable-AI, bolt.diy) plus the
> Project Titan foundation. **Every new capability is OFF by default** — deploying
> as-is changes nothing until you flip a flag. Verify with `npm run type-check`
> and `npm run build` on your machine first (the dev sandbox can't run a full
> build, and its mount truncates large files on read).

## 1. Deploy order

1. Pull / merge the changes.
2. `rm -rf .next` (clears stale generated types).
3. Apply DB migrations in order: **068 → 069 → 070 → 071** (all idempotent / `IF NOT EXISTS`).
4. `npm run type-check && npm run build`.
5. Deploy. Optionally enable features via env (section 4) one at a time.

## 2. Database migrations

| File | What it does | Risk |
|------|--------------|------|
| `068_titan_ai_company.sql` | Titan multi-agent tables (`project_ai_agents`, `project_ai_agent_messages`, `project_ai_agent_decisions`) + RLS + trigger | Additive |
| `069_domain_registrations.sql` | `domain_registrations` table + RLS; backfills `projects.custom_domain_verified` / `custom_domain_token` (`ADD COLUMN IF NOT EXISTS`) | Additive (also fixes a column the existing domain-verify route already referenced) |
| `070_seed_initial_data.sql` | (pre-existing) feature flags + starter app seed | Idempotent |
| `071_seed_starter_templates.sql` | Seeds the 6 curated design templates into the gallery (featured, public) | Idempotent |

## 3. What changed, by feature

### New files (additive — inert unless invoked)
- **Agent tools / intelligence:** `lib/ai/code-analyzer.ts` (TS/JS structural analysis). New tools wired in `lib/ai/agent.ts`: `edit_file`, `glob_search`, `analyze_code`, `find_definition`, `generate_image` + a write_file "File Demolition" guard.
- **Multi-agent (Titan):** `lib/ai/titan/{types,roles,orchestrator}.ts`; routes `app/api/titan/initiative` (SSE) and `app/api/titan/cto`. **Wired into the existing AI Company panel** as the "Build with the Company" action (your pre-existing `lib/titan/` + `/api/projects/[id]/ai-company` discussion feature now executes real builds via this orchestrator; `seedAgents:false` avoids roster duplication).
- **Sandbox execution (E2B):** `lib/sandbox/index.ts`; routes `app/api/projects/[id]/sandbox-preview` (+ `/stop`); `lib/preview/use-sandbox-preview.ts`; `sandbox` tier in `lib/preview/resolve-preview-engine.ts`.
- **Image generation (Gemini/DALL-E):** `lib/ai/image-generate.ts` (shared helper) + `lib/ai/image-asset.ts` (generate→store→URL for the build agent) + runtime proxy `app/api/projects/[id]/image-proxy` for BUILT apps.
- **Design variety:** `lib/ai/design-directions.ts` — 8 curated, domain-aware design directions auto-picked per build.
- **Domains:** `lib/domains/{registrar,hosting}.ts` (not yet wired to existing domain routes — dormant).
- **Design templates:** `lib/templates/starter-catalog.ts`, `lib/ai/template-refine.ts`.
- **Prompt enhancer:** `app/api/ai/enhance/route.ts`, `lib/hooks/use-enhance-prompt.ts`.

### Changed existing files (hot paths — behavior gated by flags)
- `lib/ai/model-defaults.ts` — Claude-first tiers **behind `LIFEMARK_CLAUDE_DEFAULTS`** (off = prior models). Slugs use OpenRouter DOT notation (`anthropic/claude-opus-4.8`, `…sonnet-4.6`, `…haiku-4.5`) — verified live; fixed a pre-existing hyphen bug that silently fell back to gpt-4o.
- `lib/ai/system-prompts.ts` — (1) design system no longer forces dark; theme chosen per app. (2) E-commerce images mandatory + image-proxy usage taught. (3) agent prompt lists the new tools incl. `generate_image`.
- `components/editor/ai-company-panel.tsx` — added "Build with the Company" (runs the orchestrator, live SSE log, real file writes) alongside the existing discussion features.
- `app/api/titan/initiative/route.ts` — `seedAgents` flag (skip roster seeding when called from the existing panel).
- `lib/ai/provider.ts` + `lib/ai/generate.ts` — per-model output-token **clamp** (always safe; only clamps down).
- `app/api/ai/chat/route.ts` — `BUILD_MAX_TOKENS` default back to **32000** (set 64000 to opt in); reads `templateId` → appends design-refinement block in build mode.
- `app/api/ai/plan/route.ts` — plan now uses the reasoning tier + 8000 tokens (follows the model flag).
- `components/editor/chat-panel.tsx` — sends `templateId` (from `?template=` URL) on build.
- `components/editor/preview-panel.tsx` — sandbox preview auto-fetch **behind `NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW`** (off = no extra request); new `sandbox` render branch.
- `components/dashboard/prompt-create-box.tsx` — "Enhance" button + design-template picker; preselect from `?template=`.
- `components/templates/templates-grid.tsx` — design-baseline cards route to create box with template preselected.
- `gateway/src/index.ts` — added current Claude keys (native + slug) to the billing cost map.
- `CLAUDE.md` — Titan section + model-row note.

## 4. Feature flags (all default to old behavior)

Documented in `.env.local.example`. Enable one at a time:

| Flag | Default | Enables |
|------|---------|---------|
| `LIFEMARK_CLAUDE_DEFAULTS` | off | Opus 4.8 / Haiku 4.5 model lineup |
| `BUILD_MAX_TOKENS` | `32000` | set `64000` for single-pass complete-app builds |
| `NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW` | `0` | real E2B sandbox preview (also needs `E2B_API_KEY` + `npm i @e2b/code-interpreter`) |
| `E2B_API_KEY`, `E2B_TEMPLATE` | unset | sandbox backend |
| `GOOGLE_GENERATIVE_AI_API_KEY` / `OPENAI_API_KEY` | unset | image generation (in-builder, build-time `generate_image`, and the built-app `image-proxy`). Without either, image features no-op gracefully. |
| `DOMAIN_REGISTRAR`, `CLOUDFLARE_*`, `IONOS_API_KEY` | unset | in-product domain purchase (UI not wired yet) |
| `OPENROUTER_*_MODEL` | unset | pin any tier to a specific model |

Always-on (no flag, but inert until used): the new agent tools (incl. `generate_image`), template picker/enhancer UI, the per-build **design-direction** auto-selection (first build only), the theme-aware design system, Titan routes + the AI-Company "Build" action (run on demand), and the output-token clamp.

## 5. Rollback levers

- **Models:** unset `LIFEMARK_CLAUDE_DEFAULTS` (or set `OPENROUTER_*_MODEL` to pin) → prior lineup instantly.
- **Build size:** `BUILD_MAX_TOKENS=32000`.
- **Preview request:** `NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW=0`.
- **Titan / domains / sandbox:** leave env unset — endpoints exist but nothing calls them in core flows.
- **Code-level:** all changes are isolated; reverting any single new file or the gated blocks restores prior behavior.

## 6. Caveats to verify locally

1. **Model slug validity — RESOLVED.** Verified against openrouter.ai (2026): the
   correct OpenRouter slugs use DOT notation — `anthropic/claude-opus-4.8`,
   `anthropic/claude-sonnet-4.6`, `anthropic/claude-haiku-4.5` (native Anthropic
   API ids use hyphens; OpenRouter slugs use dots). Code now uses the dot form in
   `model-defaults.ts`, the chat-panel model picker, and the gateway cost map.
   Note: this also fixed a **pre-existing bug** — the old default
   `anthropic/claude-sonnet-4-6` (hyphen) likely 400'd and silently degraded the
   heavy tier to gpt-4o; the flag-off path now correctly uses Sonnet 4.6.
2. **Cost** — Opus + 64K + 8K plans materially raise per-action spend vs the old Sonnet/gpt-4o-mini defaults. Credit *prices* unchanged → margin impact. (Both gated.)
3. **No new npm deps required** — E2B loads via optional dynamic import; only install `@e2b/code-interpreter` if enabling the sandbox.
4. **Verification was per-file** — every changed file type-checks in isolation (0 errors) and a full `tsc` pass showed only mount/generated artifacts. Run the real `build` locally before shipping; `git diff` to confirm files are whole.

## 7. Not yet wired (future, optional)

- Domain purchase UI (`/api/domains/search` + `/buy` routes + Stripe `domain_purchase` webhook branch).
- Titan "Company" editor panel to surface live multi-agent runs.
- Platform-owned hosting target / own SSL (P3 in `docs/titan/09-domains-hosting.md`).
