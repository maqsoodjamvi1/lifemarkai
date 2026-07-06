# Ship Checklist — pending bundle (July 4 2026)

## ⭐ One-shot ship (run on YOUR machine, not the sandbox)

> Run from a fresh `git pull` on your real checkout — NOT the agent VM (its mount can serve
> truncated copies of session-edited files, which would commit broken files). Stage explicit
> paths only; never `git add .` (the tree has junk like `DockerDesktopInstaller.exe`).

```bash
cd D:\Projects\lifemarkai
git add \
  lib/preview/build-fallback-html.ts lib/ai/preview-verify.ts lib/ai/self-verify.ts \
  lib/ai/file-selector.ts lib/ai/model-catalog.ts lib/ai/openrouter-credits.ts lib/ai/generate.ts \
  app/api/ai/chat/route.ts scripts/verify-preview-transpiler.ts scripts/eval-routing.mjs \
  lib/integrations/connector-registry.ts components/editor/app-connectors-panel.tsx \
  supabase/migrations/077_audit_log_immutable.sql lib/audit/log.ts \
  components/dashboard/audit-logs-page.tsx components/dashboard/security-center-page.tsx \
  app/api/security/scheduled-scan/route.ts app/api/security/findings/route.ts vercel.json \
  app/api/projects/\[id\]/route.ts app/api/projects/invite/route.ts app/api/projects/\[id\]/env/route.ts \
  lib/api/api-key.ts app/api/keys/route.ts app/api/mcp/route.ts \
  app/api/v1/projects/route.ts "app/api/v1/projects/[id]/route.ts" "app/api/v1/projects/[id]/files/route.ts" \
  lib/seo/audit.ts app/api/projects/\[id\]/seo-audit/route.ts components/editor/seo-panel.tsx \
  lib/security/scan.ts lib/security/deps.ts app/api/projects/\[id\]/security-scan/route.ts \
  scripts/verify-seo-audit.mjs scripts/verify-dep-audit.mjs \
  docs/public-api.md docs/compliance/soc2-evidence-starter.md docs/SHIP-CHECKLIST.md
git commit -m "feat: 52 connectors, immutable audit log + audit wiring + scheduled security scans, public API + unified MCP auth, real SEO + dependency audits; blank-preview fix + hydration routing"
git push origin master
```

Then: **run migration `077`** on Supabase, confirm `CRON_SECRET` is set, and **force-deploy without cache** on Coolify (that build runs `tsc` — the authoritative type-check). Post-deploy checks are in each section below.

---


Everything below is **written and logic-tested but unpushed** (I can't `git push` — no creds in
the agent env). Production is still on `9cd3e33`, which has the **blank-preview bug**. Land this to
fix it and turn on the cost + routing work.

> **Type-check status (§2b–2d bundle):** ran `tsc --noEmit` (scoped to the changed files + their
> import graph) via esbuild syntax pass + the repo tsconfig. All 12 TS/TSX files compile clean.
> One real error was found and fixed — a lost type-narrowing in `security-center-page.tsx`
> (captured `data.results` into a const before the `setScanResults` closure). No other errors.
> (The @ts-nocheck v1/scheduled-scan routes were syntax-checked with esbuild.)

## 1. Core bundle — reliability + cost + routing (push first)

| File | What it does | Verified |
|------|--------------|----------|
| `lib/preview/build-fallback-html.ts` | **Fixes blank preview** (guards `tailwind.config` → no "tailwind is not defined"); #130 missing-component guard; `PREVIEW_ENGINE_REV` 27 | logic reasoned |
| `scripts/verify-preview-transpiler.ts` | Regression fixtures (tailwind guard, import.meta, dup-const, undefined-component) | 4 fixtures |
| `lib/ai/preview-verify.ts` | Static verifier now catches every blank-screen fatal (no browser needed) | 7 port assertions |
| `lib/ai/self-verify.ts` | Playwright default-on (safe fallback) + blank-screen / missing-component render detection | reasoned |
| `lib/ai/file-selector.ts` | **Hydration file selection** — fast model picks relevant files; the $2→~$0.50 fix | 13 port assertions |
| `app/api/ai/chat/route.ts` | Wires file selection into the build prompt (`contextFiles`) | reasoned |
| `lib/ai/model-catalog.ts` | free→heavy cascade + OpenAI/Claude quality-tier bonus (cheap for trivial, GPT/Claude for real work) | 10 port assertions |
| `lib/ai/openrouter-credits.ts` | OpenRouter balance guard — pause at `OPENROUTER_MIN_CREDIT`, never negative | 9 port assertions |
| `lib/ai/generate.ts` | Wires the balance guard as a pre-flight | reasoned |
| `scripts/eval-routing.mjs` | Back-test harness for the routing economy (`node scripts/eval-routing.mjs`) | 7/7 |

```bash
cd D:\Projects\lifemarkai
git add lib/preview/build-fallback-html.ts scripts/verify-preview-transpiler.ts \
        lib/ai/preview-verify.ts lib/ai/self-verify.ts lib/ai/file-selector.ts \
        app/api/ai/chat/route.ts lib/ai/model-catalog.ts \
        lib/ai/openrouter-credits.ts lib/ai/generate.ts scripts/eval-routing.mjs
git commit -m "fix(preview): tailwind blank-page; hydration file-selection ($2->~$0.50); OpenAI+Claude routing; OpenRouter balance guard; stronger verification"
git push origin master
```
⚠️ Stage only these paths — NOT `DockerDesktopInstaller.exe` or other junk in the tree.

## 2. Extended bundle — in-app AI connector + security (optional, same or later push)

Also unpushed from earlier this session (independent of the core fix):
`lib/ai/auto-wire-ai.ts`, `lib/security/scan.ts`, `components/editor/ai-integration-panel.tsx`,
`supabase/migrations/073_ai_request_logs.sql`,
`app/api/projects/[id]/security-scan/route.ts`, `app/api/projects/[id]/ai-proxy/route.ts`,
plus earlier edits already may be in `9cd3e33` (`lib/ai/agent.ts`, `editor-intelligence.ts`,
`system-prompts.ts`, `components/editor/chat-panel.tsx`). Migration 073 must be run on the DB for
the AI activity view.

## 2b. Enterprise beachhead — audit immutability + Security Center scheduled scans

Unpushed (independent; safe to ship with or after the core bundle):

| File | What it does | Verified |
|------|--------------|----------|
| `supabase/migrations/077_audit_log_immutable.sql` | Append-only trigger on `audit_logs` (blocks UPDATE/DELETE for everyone incl. service_role) + `purge_old_audit_logs()` retention + resource_type index | SQL review |
| `lib/audit/log.ts` | Server helper `logAuditEvent()` / `logAuditFromRequest()` (ip+UA capture) + `auditCategory()` | pure TS |
| `components/dashboard/audit-logs-page.tsx` | Fixed schema (resource_type/resource_id/metadata) + category filter chips (auth/member/project/billing/config/security) | reasoned |
| `app/api/security/scheduled-scan/route.ts` | CRON_SECRET-guarded nightly scan → reconciles findings into `health_findings` (category=security); new→open, gone→fixed | reasoned |
| `app/api/security/findings/route.ts` | Workspace roll-up GET of persisted open security findings (per project) | reasoned |
| `components/dashboard/security-center-page.tsx` | Loads persisted findings on mount so the roll-up reflects the nightly scan; FAQ updated | reasoned |
| `vercel.json` | Adds the `/api/security/scheduled-scan` cron (04:15 daily) | — |
| `docs/compliance/soc2-evidence-starter.md` | SOC 2 control→feature map + evidence checklist (Item 4 starter) | — |

**Requires on the DB:** run migration 077. **Requires env:** `CRON_SECRET` (already used by other crons).
**Still needs hands-on work (not code):** finish SSO (OIDC/SAML) against a real IdP in staging.

**Audit wiring — DONE:** `logAuditFromRequest()` is now called (fire-and-forget) after each successful
mutation in the sensitive routes, so the immutable trail is actually populated:
- `app/api/projects/[id]/route.ts` → `project.delete`
- `app/api/projects/invite/route.ts` → `member.invite` (added + pending) / `member.remove`
- `app/api/projects/[id]/env/route.ts` → `config.env.update` (logs the **key name only**, never the value)
- `app/api/keys/route.ts` → `auth.apikey.create` / `auth.apikey.revoke`
Type-checked clean (the 3 sibling routes + `lib/audit/log.ts` pass tsc; the 2 errors tsc reported in
`[id]/route.ts` were mount-truncation phantoms — the real file is valid, confirmed by re-read).

## 2c. Distribution — public REST API + unified MCP auth

Unpushed (no DB migration needed; uses the existing `api_keys` table):

| File | What it does | Verified |
|------|--------------|----------|
| `lib/api/api-key.ts` | Canonical `validateApiKey` + `hasScope` + `authenticateApiRequest(req, scope)` — one source of truth | grep-checked |
| `app/api/keys/route.ts` | Now re-exports `validateApiKey` from the lib (removed the duplicate) | grep-checked |
| `app/api/v1/projects/route.ts` | Public REST: GET list (projects:read) + POST create (projects:write), CORS | reasoned |
| `app/api/v1/projects/[id]/route.ts` | GET project + file count (projects:read) | reasoned |
| `app/api/v1/projects/[id]/files/route.ts` | GET file list / single file by `?path=` (projects:read) | reasoned |
| `app/api/mcp/route.ts` | MCP now accepts scoped `lmk_` keys (legacy mcp_api_token fallback) + per-tool scope enforcement | grep-checked |
| `docs/public-api.md` | Auth, scopes, REST + MCP reference | — |

One key system (`lmk_…`) now covers REST, AI, and MCP. No env or DB changes required.

## 2d. Distribution — real SEO audit (replaces simulated one)

The SEO panel's "Site Audit" was **simulated** (fixed 1.8s delay → hardcoded findings). Now it runs
a real static analysis over the project's files. Unpushed; no DB/env changes:

| File | What it does | Verified |
|------|--------------|----------|
| `lib/seo/audit.ts` | Pure static SEO analyzer (title, meta desc, canonical, OG, robots, sitemap, img alt, JSON-LD, H1, viewport, lang, llms.txt) → findings + 0–100 score | **17/17 port tests** |
| `app/api/projects/[id]/seo-audit/route.ts` | GET, owner/collab auth, runs `auditProject` over project_files | reasoned |
| `components/editor/seo-panel.tsx` | `handleScan` calls the real endpoint (falls back to the reference checklist if no project/failure) | reasoned |
| `scripts/verify-seo-audit.mjs` | Regression suite (good vs bad fixtures, esbuild-bundled real lib) | `node scripts/verify-seo-audit.mjs` |

## 2e. Distribution — real dependency/supply-chain audit (replaces hardcoded list)

The Security Center's "Supply Chain" checks were a **hardcoded static list**. Now the security scan
runs a real dependency audit over the project's package.json. Unpushed; no DB/env changes:

| File | What it does | Verified |
|------|--------------|----------|
| `lib/security/deps.ts` | Static supply-chain audit: unpinned/floating ranges, non-registry (git/url/file) sources, missing lockfile, dependency bloat, curated known-risky/deprecated packages → `SecurityFinding[]` (kind `dependency`) | **10/10 tests** |
| `lib/security/scan.ts` | `SecurityFinding.kind` union extended with `"dependency"` | type-clean |
| `app/api/projects/[id]/security-scan/route.ts` | Merges `auditDependencies()` into the scan result; recomputes summary + severity sort | type-clean |
| `scripts/verify-dep-audit.mjs` | Regression suite (good/bad/broken/lockfile fixtures) | 10/10 |

## 2f. Distribution — domain registrar (Name.com buy + Entri connect)

Wires both of Lovable's domain paths. Unpushed. **Run migration 078**; set the env below.

| File | What it does | Verified |
|------|--------------|----------|
| `lib/domains/registrar.ts` | Added **Name.com** driver (v4: checkAvailability, register, DNS records, renew; Basic auth) + factory auto-selects first configured driver (Name.com preferred) | tsc clean |
| `lib/domains/entri.ts` | **Entri** connect-existing flow: mints short-lived Entri auth token, returns A/TXT DNS records + client config, manual fallback | tsc clean |
| `supabase/migrations/078_domain_registrar_namecom.sql` | Allows `namecom` in the `domain_registrations.registrar` CHECK | SQL |
| `app/api/domains/search/route.ts` | Availability + price via the configured registrar | syntax OK |
| `app/api/domains/purchase/route.ts` | Register + wire DNS + persist + attach to project (gate behind Stripe payment in prod) | syntax OK |
| `app/api/domains/entri/route.ts` | Start Entri connect (token + records) or manual fallback | syntax OK |

**Env:** `NAMECOM_USERNAME`, `NAMECOM_API_TOKEN` (+ optional `NAMECOM_API_HOST` for the dev sandbox); `ENTRI_APPLICATION_ID`, `ENTRI_SECRET`; optional `LIFEMARK_INGRESS_IP`, `LIFEMARK_APP_DOMAIN`, `DOMAIN_VERIFY_SALT`. Purchase is **untestable here** (no registrar account) — validate against Name.com's dev host (`api.dev.name.com`) before going live.

## 3. Rebuild (I can do this once pushed)

Coolify → app → **Advanced → Force deploy (without cache)**. The build runs `tsc`, so it is the
real type-check for these ~10 files — if anything fails to compile it stops there and we fix it.

## 4. Post-deploy verification

- Open a project → preview **paints** (no `tailwind is not defined`); a bad component shows a
  "⚠ missing component" placeholder, not a blank screen.
- Run a build on an existing app → token cost per turn drops (file selection sends ~10 files, not 44).
- Trivial edit routes to `qwen3-coder:free`; a real build/fix routes to GPT/Claude.
- With `OPENROUTER_MIN_CREDIT` set, AI pauses at the floor instead of going negative.

## Env to confirm on Coolify
- `OPENROUTER_MIN_CREDIT` (e.g. `0.50`) — balance-guard floor.
- Model slug overrides `OPENROUTER_MODEL__<KEY>` if any catalog slug 404s.
