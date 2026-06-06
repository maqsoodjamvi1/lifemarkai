# LifemarkAI — Next Build Plan

> Built from a fresh re-read of all 8 Lovable docs in this repo, cross-referenced
> against the actual code as of 2026-05-28.

## Summary of where things stand

The older planning docs (`LOVABLE_CLONE_PLAN.md`, `LOVABLE_COMPARISON.md`,
`LOVABLE_GAP_ANALYSIS.md`) are **stale**. `LOVABLE_GAP_STATUS_UPDATED.docx` and
`LOVABLE_DEEP_AUDIT.docx` are the current source of truth — and even those
underestimate what's been shipped. Code audit confirms the following are
already in production:

- AI gateway (`/gateway/`, Cloudflare Worker, model routing + usage logging)
- Build-with-URL (`BuildWithUrlHandler` intercepts `?autosubmit=true#prompt=…`)
- Skills CRUD + import-from-GitHub + import-from-ZIP (`/api/skills/import`)
- Design systems (project-as-system, migration 050)
- App auth providers for built apps (migration 052)
- Gemini model family (`lib/ai/provider.ts`)
- Playwright real-browser testing (gated by `PLAYWRIGHT_ENABLED`)
- Daily-backups endpoint + retention (`/api/cloud/daily-backups`)
- AI-driven data analysis sandbox (`/api/ai/analyze` — Python with pandas /
  matplotlib / Pillow / openpyxl / reportlab / python-docx / python-pptx)
- "Stuck?" guarded-prompt chips, patience microcopy, loop-detection banner,
  role-isolation and frustration prompt injections (`chat-panel.tsx`)

What's actually missing is much smaller than the older docs suggest.

---

## Tier A — Strategic gaps (largest user impact)

### A1. Skill auto-loading by description match  ·  S (1–2 days)

**Why now:** Skills only fire today when the user types the exact name. Lovable
auto-attaches a skill whenever the user's prompt semantically matches its
description — that's what makes them feel ambient instead of cli-flavored.

**Approach:** when the user sends a chat message, compute a cheap similarity
score against each enabled skill's `description` field (use
`text-embedding-3-small` cached server-side, OR fall back to a keyword bag-of-
words match if no embeddings infrastructure exists). Attach any skill whose
similarity > 0.78 to the system prompt automatically, and surface a small
"using skill: X" chip in the rendered message so the user sees what fired.

**Files:** `app/api/ai/chat/route.ts` (entry hook), `lib/ai/skill-matcher.ts`
(new), `components/editor/chat-panel.tsx` (skill-fired chip).

**Migrations:** none (uses existing `workspace_skills.description`).

### A2. Branded workspace subdomain  ·  M (3–5 days)

**Why now:** Currently a project publishes at `<slug>.lifemarkai.app`. Lovable
lets workspace owners verify a domain and get `<app>.<workspace>.lovable.app`
plus an SSL cert.

**Approach:** add `workspace_subdomain` and `workspace_subdomain_verified_at`
columns on `workspaces`, plus a DNS-provisioning state machine
(Provisioning → Issuing → Active → Failed). Reuse the existing custom-domain
verification code in `/api/domains/verify`. Update the deploy worker to
honor the workspace subdomain when a project doesn't have its own custom
domain.

**Files:** `supabase/migrations/055_workspace_subdomain.sql` (new),
`app/api/workspaces/subdomain/route.ts` (new),
`components/dashboard/workspace-branding-page.tsx` (extend),
`gateway/src/index.ts` (route lookup).

### A3. Inline file-generation downloads in chat  ·  S (1 day, polish-only)

**Why now:** `/api/ai/analyze` already runs Python and produces files — but the
chat UI treats the resulting attachments as inline code blocks rather than
download cards. Lovable renders them as cards with thumbnails, filenames,
sizes, and a Save button. Quick polish that makes the existing feature
discoverable.

**Approach:** detect attachment URLs in the streaming chat response and render
them as `FileAttachmentCard` (already exists in shadcn) instead of inline code
blocks. Add a "Save to project" action that copies the file into
`project_files` at the user's chosen path.

**Files:** `components/editor/chat-panel.tsx`,
`components/editor/file-attachment-card.tsx` (new — small).

### A4. Native mobile shell  ·  L (3–4 weeks)

**Why now:** Lovable has a real iOS + Android app. LifemarkAI has Electron
(desktop only). The PROJECT_ANATOMY doc shows Lovable wraps generated apps
with Capacitor — but the LifemarkAI editor itself does not have a mobile
shell.

**Approach:** wrap the existing Next.js editor in **Capacitor**, not React
Native. Capacitor reuses the web build, supports iOS + Android, and matches
what Lovable does for generated apps. The editor's keyboard-heavy UX needs a
mobile rework: hide the file tree by default, surface the chat composer as a
bottom sheet, make the preview occupy the full viewport.

**Effort split:** 1 week Capacitor setup + 1 week mobile UI adaptations +
1–2 weeks app-store packaging / signing / submission flow.

**Not recommended for this sprint** — gated on real telemetry showing
mobile interest. PWA first; native shell only after PWA usage proves the
demand.

---

## Tier B — Quick wins (2–3 days total)

### B1. "Save chat message as skill" action  ·  S (4 hours)

When the user hovers a useful assistant message, show "Save as skill" in the
overflow. Captures the prompt + the assistant reply into a new skill draft.
Closes the auto-loading loop with A1.

### B2. Workspace-skill visibility per project  ·  S (4 hours)

Add a per-project enable/disable toggle on each workspace skill so noisy
skills don't fire everywhere. UI lives in the existing Skills panel; storage
is a `project_skill_overrides` table or a JSON column on `projects`.

### B3. Schedule daily-backup cron in production  ·  S (1 hour)

`/api/cloud/daily-backups` exists but nothing schedules it. Add a Vercel
cron entry (`vercel.json` → `crons`) or a Supabase Edge scheduled function
that hits the endpoint nightly per workspace.

### B4. App-side Google OAuth wizard surface  ·  M (1–2 days)

Migration 052 (`app_auth_providers`) defines the schema. There is no UI yet
for project owners to enable Google/Apple OAuth on built apps. Build a small
panel that toggles the provider per project, captures client_id /
client_secret, and surfaces the generated callback URL pattern.

---

## Tier C — Connector long-tail (parallel track; pick high-value ones)

The deep audit lists 25 app connectors + 15 MCP connectors missing. **Don't
build all of them** — most are 1–3 day vendor SDK wraps with diminishing
returns. Recommended order based on what real users actually request:

App connectors (in priority order)
- HubSpot — CRM is the most-requested missing connector
- Microsoft 365 / Google Workspace umbrellas — high-leverage (Gmail, Calendar,
  Drive, Sheets, Outlook, Teams, OneDrive)
- Snowflake / BigQuery / Databricks — data tier customers
- Brevo / Mailgun — alternative transactional email vendors
- Inngest — durable workflows; pairs with the new analyze endpoint

MCP connectors (chat-time integration)
- Atlassian (Jira + Confluence) — read tickets/pages in chat
- Linear MCP — issues into prompt context
- Notion MCP — docs into prompt context
- Sentry MCP — pull error stacks into chat
- PostHog MCP — bring product analytics into the chat
- Custom MCP server URL field — user-supplied bearer / OAuth / API key

Each follows the same recipe as the existing connectors in
`components/editor/app-connectors-panel.tsx` and
`components/editor/connector-wizard-panel.tsx`.

---

## Tier D — Vendor / strategic (defer)

- **Aikido pen-testing** — needs Aikido contract + sales relationship.
- **Wiz vulnerability scanning** — enterprise-only, very niche.
- **Lovable Cloud equivalent (managed Postgres alternative to Supabase)** —
  multi-month rebuild. The AI gateway is the only Cloud component you need
  for parity with the "built-in AI, no API keys" experience, and it's
  already shipped. Building a full hosted Postgres + auth tier is only
  worth it if customer demand says so.

---

## Recommended sprint plan

### Sprint 1 — Power UX (3 days)
- A1 — Skill auto-loading by description match
- A3 — Inline file-generation cards in chat
- B1 — Save chat message as skill
- B2 — Workspace-skill per-project visibility

### Sprint 2 — Workspace identity (4 days)
- A2 — Branded workspace subdomain
- B3 — Schedule daily-backup cron in production
- B4 — App-side Google OAuth wizard

### Sprint 3 — Connector batch (1–2 weeks)
Pick 6 from Tier C — three app connectors + three MCP — based on your top
support requests this month.

### Sprint 4 (optional) — Mobile PWA polish (1 week)
PWA install banner + mobile-first chat composer + bottom-sheet preview.
Defer Capacitor native shell unless PWA usage data justifies it.

---

## Anti-recommendations

These were in older planning docs and should NOT be done because the code
already has them:

- "Build AI gateway" — done (`/gateway/`).
- "Build skill import from GitHub" — done (`/api/skills/import`).
- "Build build-with-URL" — done (`BuildWithUrlHandler`).
- "Build daily backups endpoint" — done (`/api/cloud/daily-backups`).
- "Build design systems propagation" — done (migration 050).
- "Build chat data-analysis sandbox" — done (`/api/ai/analyze`).
- "Build Gemini support" — done (`lib/ai/provider.ts`).
- "Build presence avatars" — done (`editor-top-bar.tsx` realtime channel).
- "Build cross-project @ mentions" — done (`chat-panel.tsx` line 1414).

Any future doc work should mark these as DONE and stop re-listing them as
gaps.

---

## Verification commands

After applying anything from this plan:

```powershell
cd D:\Projects\lifemarkai
npm run dev                                   # editor at localhost:3000
node --test lib/security/static-scan.test.ts  # the one test suite we have
supabase db push                              # any new migrations
```
