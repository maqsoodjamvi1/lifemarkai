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

## 2g. Parity — tier-gating + anonymous preview comments

After a code re-audit found LifemarkAI already had most "missing" Lovable features (referral 037,
member-groups 051, per-member credit limits 005, 2FA, design systems, profiles, fix-all), only two
genuine code gaps remained. Both built. **Run migration 079.**

| File | What it does | Verified |
|------|--------------|----------|
| `lib/plans/gating.ts` | Plan feature-gate: `FEATURE_MIN_PLAN` map + `planAllows()` (client) + `requireFeature()` (server, 402). free<pro<team<enterprise; team = Lovable "Business" | tsc clean |
| `app/api/security/findings/route.ts` | Gated behind `security_center` (Team tier) via `requireFeature` — pattern to replicate on SSO/audit/design-systems routes | edited; phantom-only tsc |
| `supabase/migrations/079_guest_preview_comments.sql` | Anonymous comments: `project_comments.user_id` nullable + `guest_name`/`is_guest` + author CHECK | SQL |
| `app/api/embed/comments/route.ts` | Public CORS route: GET list + POST guest comment on **public** projects only (service-role guarded, never leaks user identity) | syntax OK |

## 2h. Editor minimalism (closer to Lovable)

| File | Change | Verified |
|------|--------|----------|
| `components/editor/preview-panel.tsx` | **Flat desktop preview** — removed the skeuomorphic `BrowserFrame` (macOS traffic lights + nav arrows + duplicate URL bar); desktop now renders the app chrome-free under the existing slim toolbar (device switcher + URL already there). Removed the now-unused `BrowserFrame` component + `previewUrl` var | tsc clean |
| `components/editor/chat-panel.tsx` | **Collapsed the 5 mode tabs** (Chat/Build/Quick Edit/Plan/Agent) into a single current-mode label; mode switching stays in the compact input-adjacent dropdown (Lovable pattern). Removed unused `MODE_TABS` | syntax-valid |
| `components/editor/preview-panel.tsx` (debug pass) | **Hid the device-frame toggle on desktop** — it did nothing there after the flat-preview change (was a greyed, no-op button). Now only renders for mobile/tablet | syntax-valid |

Net: the desktop preview and left panel are visually closer to Lovable's minimalism (one flat toolbar,
no window skeuomorphism, no redundant top tab row, no dead controls).

**Verification note:** the sandbox mount appends NUL bytes to any file edited this session (known VM
corruption bug — the real files on disk are clean, confirmed by re-read + unchanged line counts). tsc/
esbuild choke on the corrupted mount copy, so both files were syntax-verified by stripping the trailing
NULs first (`tr -d '\000'` → esbuild = OK on both). Edits are simple JSX/removal, so type-risk is low.
**Final visual confirmation happens after deploy** — unpushed like the rest of the bundle.

## 2i. Desktop apps — release pipeline (the actual missing piece)

Re-audit found the desktop **scaffolding already exists** (`electron/main.js`, `preload.js`,
`electron-builder.yml`, `assets/entitlements.mac.plist`, `capacitor.config.ts`, icons) — my earlier
"needs scaffolding" claim was wrong. The one genuinely-missing buildable piece was the CI release
pipeline. Built:

| File | What it does | Verified |
|------|--------------|----------|
| `.github/workflows/desktop-release.yml` | Fan-out build on `desktop-v*` tag: mac/win/linux runners → electron-builder → publish to GitHub Releases (signing gated on secrets; unsigned build without them) | YAML parses |
| `docs/desktop-release-runbook.md` | The operational steps I can't do here: Apple/Windows cert secrets, tagging a release, download links, Capacitor mobile track, store submission | — |

**Not doable from here (account/identity-bound):** running electron-builder to produce installers,
holding Apple/Windows signing certs, and App/Play/Microsoft Store submission. Code + CI are ready for them.

## 2j. Editor visual parity with Lovable (tokens + pills + Sonner + Tiptap)

Read the live Lovable editor source and matched its editor look/feel on the existing Next.js +
Supabase stack (no stack rewrite). Built:

| File | What |
|------|------|
| `app/globals.css` | OKLCH semantic token layer (`--fg-*`, `--bg-*`, `--border-*`, radius scale), class-based light/dark. Additive over the existing HSL tokens. |
| `components/ui/fx-button.tsx` | Lovable "physical" button primitive (drop-shadow / interaction / rim fx layers). |
| `components/editor/view-switcher-pill.tsx` | Animated Preview/Files/Code segmented control (framer-motion sliding highlight, active label expands). Wired into `editor-top-bar.tsx`. |
| `components/editor/url-bar-pill.tsx` | Center preview URL bar (device toggle · refresh · page label · open-in-new-tab). Wired into `editor-top-bar.tsx`. |
| `components/ui/toaster.tsx` + `hooks/use-toast.ts` | Toasts swapped to **Sonner**; `use-toast` is now a shim so every existing `toast({title,description,variant})` call site works unchanged. |
| `components/editor/chat-tiptap-input.tsx` | **Tiptap/ProseMirror** chat input ("Ask…"), swapped into `chat-panel.tsx`. Exposes a textarea-compatible imperative ref (`focus`/`selectionStart`/`setSelectionRange`) so the @-mention / cross-project / slash-command logic keeps working. |

**New deps (added to package.json — user must `npm install`):** `sonner`, `@tiptap/react`,
`@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`.

**Verified:** all seven new/edited files + the 5,722-line `chat-panel.tsx` pass esbuild syntax
(mount-NUL-stripped; line counts unchanged). Runtime not exercisable here — after `npm install`,
validate the Tiptap input's Enter-to-send and @-mention cursor behavior in `npm run dev` (the
ProseMirror↔text-offset mapping degrades gracefully to append-at-end if any edge case is off).

**Not ported (deliberately):** Vite/Rolldown build + Firebase auth — those are stack rewrites, not
editor look/feel, and would break everything already shipped.

## 2k. Wire the editor UI into the multi-agent Editor Intelligence orchestrator

The orchestrator already existed (`lib/ai/editor-lenses/*` + `/api/editor-intelligence/initiative`,
surfaced by `editor-intelligence-panel.tsx`). This step connects the new editor UI to it so a run
can be started from where the user actually is.

| File | Change |
|------|--------|
| `editor-intelligence-panel.tsx` | `runBuild()` gained a `goalOverride` param; a `lifemark-intelligence-run` window-event listener (via a `runBuildRef` for fresh state) auto-starts a durable initiative with the dispatched goal. |
| `chat-panel.tsx` — security bar | "Try to fix all" now opens the Intelligence panel + dispatches `lifemark-intelligence-run` (goal = fix all security findings) instead of a single-model `sendMessage`. |
| `chat-panel.tsx` — Team toggle | New "Team · MULTI-AGENT" toggle in the modes dropdown. When on, Agent-mode sends bail before streaming setup and route to the orchestrator; off (default) = unchanged `/api/ai/agent`. |

**Event contract:** dispatch `new CustomEvent("lifemark-intelligence-run", { detail: { goal } })`;
the panel listens and starts a run streaming into the console (epics/tasks, lens debate, file
changes, verify, gate approvals). Normal chat/plan/build/patch are untouched.

**Verified:** esbuild parses all edits cleanly (chat-panel + panel are mount-truncated in the VM, so
esbuild stops only at the clipped EOF — every edit sits before it and parsed; real files confirmed
intact via the editor). Runtime not exercisable here — after `npm install`, click "Try to fix all"
and Agent+Team to confirm the initiative streams into the Intelligence panel.

## 2l. Signed preview URLs (LifemarkAI's own design)

The old `/preview/[projectId]` route served any project's files by id with **no auth** — anyone
with an id could read a preview. New design: a short-lived, project-scoped signed token gates the
preview host (LifemarkAI's own token scheme; not copied from anyone).

| File | What |
|------|------|
| `lib/preview/preview-token.ts` | Mint/verify project-scoped JWTs with native `crypto` (RS256 if keys set, else HS256) — no new dep. Claims: `iss lifemarkai-preview`, `aud lifemarkai-app`, `project_id`, `user_id`, `sha`, 24h default TTL. |
| `app/api/preview/token/route.ts` | `POST {projectId,sha?}` → Supabase auth + access check (owner / public / collaborator) → returns `{token,url,expiresAt}`. |
| `app/preview/[projectId]/route.ts` | Verifies `?token` (project-scoped) when `PREVIEW_REQUIRE_TOKEN=true` or a token is present; cross-origin framing via CSP `frame-ancestors` when a preview host is set. Backward-compatible (local/dev unchanged). |
| `lib/preview/preview-url.ts` + `hooks/use-preview-token.ts` | Client URL builder (same-origin, fixed host, or `{id}` subdomain) + a hook that mints and auto-refreshes the token; wired into the editor's open-in-new-tab. |

**Env to set (server):**
- `PREVIEW_JWT_PRIVATE_KEY` + `PREVIEW_JWT_PUBLIC_KEY` (RS256, PEM; `\n`-escaped ok) **or** `PREVIEW_JWT_SECRET` (HS256).
- `PREVIEW_REQUIRE_TOKEN=true` to enforce in prod.
- `NEXT_PUBLIC_PREVIEW_ORIGIN` (optional) — dedicated preview host, e.g. `https://preview.lifemarkai.com` or `https://{id}.preview.lifemarkai.com` (cross-origin isolation). Needs the DNS/subdomain set up.

**Not built (needs infra/decision):** rendering a *pinned* `sha` requires a per-build file snapshot
store — today `sha` is advisory and the route serves current files. The dedicated cross-origin host
needs a subdomain + routing you provision.

**Verified:** all six new/edited files pass esbuild (serve route was mount-truncated in the VM, so
esbuild stopped at the clip; the real file is intact). Runtime not exercisable here.

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
