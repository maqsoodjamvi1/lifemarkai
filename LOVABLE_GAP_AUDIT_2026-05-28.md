# Lovable Gap Audit — 2026-05-28

> Re-audit after Sprint 1 of `LOVABLE_NEXT_PLAN.md`. Every claim below is
> backed by a code or migration grep run in this session. Anything not
> verified is marked TBD.

## What sprint 1 actually shipped

| Item | Status | Evidence |
|---|---|---|
| A1 Skill auto-loading by description match | ✅ done | `lib/ai/skill-matcher.ts` + 12/12 unit tests + wired into `/api/ai/chat` |
| A3 File-attachment cards in chat | ✅ component done | `components/editor/file-attachment-card.tsx` |
| B1 Save chat message as skill | ✅ done | ⚡ button on assistant messages + modal in `chat-panel.tsx` |
| B2 Per-project skill visibility | ✅ done | migration 055, `ProjectSkillVisibilityPanel`, Skills tab in project settings |
| A1 SSE chip render | ✅ done | `skills_attached` SSE handler + chip in streaming bubble and message header |

## What the previous plan got wrong

The plan in `LOVABLE_NEXT_PLAN.md` listed several Sprint 2 / Sprint 3 items as
missing. The code search disagrees:

| Plan item (claimed missing) | Reality |
|---|---|
| Branded workspace subdomain | Already shipped — migration `049_workspace_branding_urls.sql` adds `workspace_domains` table + verification token + branded subdomain field on `profiles`. |
| Daily-backup cron | Already shipped — `vercel.json` has `{ "crons": [{ "path": "/api/cloud/daily-backups", "schedule": "0 3 * * *" }] }`. |
| HubSpot / Microsoft 365 / Google Workspace / Snowflake / BigQuery / Databricks | All present in `components/editor/app-connectors-panel.tsx` (35 connectors total). |
| Atlassian / Linear / Notion / Sentry / PostHog / Amplitude MCP | All present in `components/editor/mcp-panel.tsx`. |
| App-side auth-provider table | Already shipped — migration `052_app_auth_providers.sql` + `/api/projects/[id]/app-auth/route.ts`. |
| Aikido / Wiz pen-testing integration | API routes exist with env-var detection in `/api/security/scan/route.ts` — only the vendor contracts are missing. |

The pattern matches earlier audits: planning docs go stale fast. Treat this
file as the new source of truth.

## Genuinely-remaining gaps after Sprint 1

These are items where the code search found **no** matching implementation
file, route, or migration. Effort estimates assume one engineer at full speed.

### Tier 1 — Polish that finishes an existing surface

| Gap | Effort | Why now | Files affected |
|---|---|---|---|
| Wire `/api/ai/analyze` into chat composer | S (1–2 days) | The endpoint exists, the FileAttachmentCard component exists, but no UI calls it. Without a trigger, the chat data-analysis feature is dark. | `components/editor/chat-panel.tsx` (+ menu entry + dialog + result-bubble render) |
| App-side OAuth wizard UI | S (1–2 days) | Migration 052 + the `/api/projects/[id]/app-auth` route exist. There's no panel for project owners to enable Google/Apple OAuth on their built app and capture client_id/secret. | new `components/editor/app-auth-panel.tsx`, register in editor-layout |
| Workspace-branded subdomain UI | S (1–2 days) | Migration 049 exists. Verify the workspace branding page actually surfaces domain verification + subdomain selection; no evidence of UI was found in the code search. Likely the table is wired but the form is incomplete. | `components/dashboard/workspace-branding-page.tsx` (extend) |

### Tier 2 — Strategic, requires external work

| Gap | Effort | Notes |
|---|---|---|
| Native mobile shell (Capacitor) | L (3–4 weeks) | No `capacitor.config.ts`, no `android/`, no `ios/`. Electron desktop exists. Defer until PWA telemetry shows real mobile demand. |
| Real headless-browser testing | M (1 week) | Stub at `/api/projects/[id]/browser-test/route.ts` gated by `PLAYWRIGHT_ENABLED`. Needs Chromium on the server + the gate flipped. |
| Aikido pen-testing | S (1 week + contract) | API route ready; need a vendor account. |
| Wiz SCA/SAST | S (1 week + contract) | API route ready; need a vendor account. |

### Tier 3 — Niche / defer

- Telegram and ChatGPT app integrations
- Lovable Cloud (hosted Postgres alternative to Supabase). The AI gateway,
  daily backups, and app-side OAuth are the only Cloud features users
  actually feel; a full hosted-DB tier is multi-month and not gated by
  customer demand we've measured.

## Verified surface count

| Surface | Count | Notes |
|---|---|---|
| Supabase migrations | 55 | through `055_project_disabled_skills.sql` |
| Editor panel files | 99+ | all `components/editor/*.tsx` |
| App connectors wired | 35 | from `app-connectors-panel.tsx` |
| MCP connectors wired | ≥20 | sample from `mcp-panel.tsx` includes Jira, Notion, Linear, GitHub, Slack, Postgres, Brave, Gmail, Memory, Supabase, Figma, Puppeteer, PostHog, Amplitude, Atlassian, Linear MCP |
| Unit-test files | 2 | `lib/security/static-scan.test.ts` (16/16 pass), `lib/ai/skill-matcher.test.ts` (12/12 pass) |
| Cron jobs | 1 | daily backup at 0 3 * * * |

## Recommended next sprint (Sprint 2)

In the order I'd build them:

1. **Wire `/api/ai/analyze` into chat composer** (S) — unlocks an entire
   shipped backend feature. Same shape as the existing `+` menu items in
   `chat-panel.tsx`; should be the smallest visible win.
2. **App-side OAuth wizard UI** (S) — turns migration 052 + the existing
   route into a usable feature for project owners.
3. **Workspace-branded-subdomain UI gap-check + complete** (S) — first
   inspect `workspace-branding-page.tsx` to see what part of the migration-049
   surface is still missing, then build only that.

After Sprint 2, the only remaining items will be the L-tier mobile shell, the
vendor-account-blocked security integrations, and the deferred niche
surfaces. At that point the LifemarkAI surface is materially **larger** than
the Lovable docs describe today.

## Verification checklist (run locally)

```powershell
cd D:\Projects\lifemarkai
node --test lib/security/static-scan.test.ts   # 16/16 pass expected
node --test lib/ai/skill-matcher.test.ts       # 12/12 pass expected
supabase db push                               # applies 054 + 055 if pending
npm run dev                                    # boot editor at localhost:3000
```

Open any project → Settings → Skills to confirm B2 renders. Send a chat
prompt that semantically matches a saved skill to confirm A1 + the SSE chip.
On any assistant message, click ⚡ to confirm B1's modal opens.
