# Session Changes — Reliability + Ecosystem

A review/merge checklist for the changes made this session. Nothing here has been
`tsc`-verified (the build sandbox was unavailable the whole session) — run the
**Verification** steps before merging.

## TL;DR

Two themes: (1) fix reliability/billing correctness in the AI gateway and deploy
worker, (2) connect ecosystem loops that existed but weren't wired up, plus seed
real templates. Most "features" already existed — these are correctness and
connection fixes, not new surface area.

## Reliability & billing

### `gateway/src/index.ts`
- **Streaming requests now bill.** Injects `stream_options.include_usage: true` for
  OpenAI/OpenRouter/Google streams so token usage actually arrives — previously
  streamed calls metered `$0`.
- **Pre-request spend ceiling.** For Cloud-attributed requests, checks
  `cloud_ai_balance_cents` and returns `402` at/below the −10000¢ floor *before*
  dispatching (debit was previously post-response only).
- **OpenRouter fallback restored.** `dispatchWithFallback` retries once on
  OpenRouter for 401/402/429 — going through the gateway no longer loses the
  resilience the direct path had.
- **`inject-secret` credential fixed.** Uses a new `SUPABASE_MGMT_TOKEN` (Supabase
  management/personal token) for the Management API instead of the project
  service-role key, which the API rejects.
- **P2 hardening:** partial-line SSE buffering (don't miss the `usage` line across
  chunk boundaries), constant-time secret comparison, upstream `AbortSignal`
  timeouts (60s/300s), and `lifemarkai.com` added to the CORS allowlist.

### `lib/queue/deploy-worker.ts`, `lib/queue/client.ts`, `app/api/deploy/route.ts`
- **No fake "live" URLs in production** — missing deploy token now throws instead of
  returning a fabricated `*.lifemarkai.app` URL (simulation kept for local dev only).
- **Vercel deploys work via the queue** — added the Vercel branch + widened
  `DeployJobPayload.provider` to include `"vercel"` (was silently falling to the
  fake-URL path).
- **No spurious failure notifications** — failure is finalized only on the last retry
  attempt (`job.attemptsMade` vs `job.opts.attempts`).
- **Notifications actually deliver** — write straight to the `notifications` table
  instead of enqueueing to a queue with no consumer.
- **Smaller Redis payloads** — worker re-fetches `project_files` by `projectId`;
  `files` is now optional on the job and the route stops shipping full source.

## Ecosystem loops

### `lib/badge.ts` (+ deploy paths)
- Badge now links to `/signup?ref=<owner referral code>` so a converting click
  **credits the app creator** via the existing redemption flow. Deploy worker and
  route look up the owner's `referral_code` and inject it; falls back to the homepage
  when there's no code. Closes the badge → referral loop.

### `app/(marketing)/explore/page.tsx`, `components/marketing/explore-client.tsx`
- Explore cards (grid + trending rail) now link to the SEO/OG/view-tracked showcase
  pages (`/p/<username>/<slug>`) instead of only the raw deployed URL or fork. The
  page resolves owner usernames in one batched query. Connects discovery → the
  viral/SEO surface.

### `app/api/projects/[id]/publish-template/route.ts` (+ migration 057)
- Added `templates.source_project_id`; publish now **upserts by source project**
  (re-publishing updates in place instead of duplicating) and "already published?"
  is detected reliably instead of by fragile name-matching.

### `lib/templates/built-in.ts`
- Converted **all 19 placeholder stubs into real, working templates** (Todo, Notes,
  Portfolio, Finance, Analytics, Weather, Music, Minimal landing, Social Feed, Chat,
  Startup Landing, Video, Calendar, Recipe, Blog, Job Board, Form Builder, CRM,
  Invoice) and **deleted the `promptTemplate` / `REMAINING_TEMPLATES` machinery**.
  The gallery is now **24 real templates, zero placeholders** (was 5 real + 19 stubs).
  Built with `clsx` (no template-literal escaping risk); Recharts pulled in via
  `pkgExtra` where needed.

## New migration

`supabase/migrations/057_template_source_project.sql` — adds
`templates.source_project_id` (FK, `ON DELETE SET NULL`), a partial unique index on
`(created_by, source_project_id)`, and a lookup index.

## New configuration

- **Gateway secret `SUPABASE_MGMT_TOKEN`** — a Supabase personal/management access
  token (NOT the service-role key). Set with:
  ```bash
  cd gateway && wrangler secret put SUPABASE_MGMT_TOKEN
  ```

## Verification (do before merge)

```bash
npm run type-check                 # root — covers gateway import sites, deploy route, templates, explore
cd gateway && npx tsc --noEmit     # the gateway worker (fully typed; watch AbortSignal.timeout typing)
supabase db push                   # apply migration 057
```

Notes:
- `lib/queue/deploy-worker.ts` is `@ts-nocheck`, so the root type-check won't cover
  it — it was reviewed by hand.
- **Pre-existing latent issue (not introduced here):** `explore-client.tsx` reads
  `project.preview_url` but that field isn't in its `Project` interface. Worth adding
  while you're in there.
- Watch `AbortSignal.timeout` in the gateway — valid at runtime, but an older
  `@cloudflare/workers-types` may not type it (type error only, not runtime).

## Runtime debugging pass (live `next dev` + real DB)

After pushing migrations 015→057 to the live database and running the app, a long
debugging session surfaced a class of "written but never executed" bugs. All
fixed:

**Migrations (DB was 42 behind; these never ran cleanly before):**
- `015` referenced `projects.owner_id` (column is `user_id`) — 4 occurrences.
- `019` trigger called `update_updated_at_column()` → real fn is `update_updated_at()`.
- `035`/`036` used `gen_random_bytes` without pgcrypto + search_path → enabled extension, `SET search_path`.
- `039` claimed `profiles.is_public` existed (it didn't) → added the column.
- `043`/`046` unguarded policy/constraint creation → added `DROP POLICY IF EXISTS` / `pg_constraint` guard.
- New migrations: **058** (`get_user_stats` live count via `deployed_url`), **059**
  (`increment_skill_use` was undefined; `add_team_credits` used `owner_id`), **060**
  (`stripe_events` table — webhook idempotency previously violated a FK and never deduped).

**Code ↔ schema mismatches:**
- `notifications` inserts used `message:` (column is `body`) — referral + build-complete + security-webhook.
- `owner_id` reads in design-system & import-files routes → `user_id`; removed an unsupported PostgREST subquery in `.or()`.
- MCP `create_project` inserted illegal `status:"draft"` (CHECK allows active/archived/building); `send_chat_message` inserted nonexistent `messages.user_id`.
- `"live"`/`"success"` status mismatches in analytics page + showcase page.

**Seven `createAdminClient()` calls missing `await`** (it's async) — crashed preview
upload, sitemap, OG images, both public `/preview` routes, cloud daily-backups,
security webhook. Plus two `params`-without-`await` (Next 16 passes a Promise).

**Auth / client:**
- `lib/supabase/client.ts`: SSR guard relaxed (was crashing every "use client" page);
  switched to `processLock`; coalesced concurrent `getUser()` (fixed lock "stolen"/"timed out" overlays).
- Service worker: prod-only registration + dev unregister; removed `/dashboard` from precache; cache-name bump.

**Editor pipeline:**
- Mode dropdown showed "Build" in every non-plan/agent mode (incl. Chat) → shows real mode; editor defaults to Build.
- `DEFAULT_AI_MODEL` → `openai/gpt-4o-mini` (DeepSeek answered in prose, breaking build parse); provider fallback now also triggers on missing-key.
- Chat route: retry-once when build returns zero files; sends/persists a human-readable `displayMessage` instead of raw JSON.
- Preview transformer (`preview-panel.tsx`): generic import/export rewriter (handles `@/` aliases, unknown pkgs, re-exports, anonymous/async default exports) + final safety net so no module syntax can SyntaxError the preview; `crossorigin` on CDN scripts (unmasks "Script error."); framer-motion stub; escaped-JSON-content guard; errors now name the file.
- `snapshots` POST: `.single()` → `.maybeSingle()` on the first-snapshot lookup.

**Not code (environmental, recurring):** machine DNS/connectivity flapping
(`ENOTFOUND` / `ConnectTimeout`, LAN IP hopping) and an OOM fork-bomb caused by the
`[wn]` debug launcher respawning crashed servers. Use a plain `npm run dev` and a
stable connection.

**Open thread:** `POST /api/projects/snapshots 500` appeared once amid network
instability; code path checks out against schema and the `.maybeSingle()` fix
removes the most likely culprit — grab the DevTools Response body if it recurs on
stable internet.

## Files touched

- `gateway/src/index.ts`
- `lib/queue/deploy-worker.ts`
- `lib/queue/client.ts`
- `app/api/deploy/route.ts`
- `lib/badge.ts`
- `lib/templates/built-in.ts`
- `app/(marketing)/explore/page.tsx`
- `components/marketing/explore-client.tsx`
- `app/api/projects/[id]/publish-template/route.ts`
- `app/api/ai/chat/route.ts`, `app/api/mcp/route.ts`, `app/api/referral/redeem/route.ts`, `app/api/billing/webhook/route.ts`
- `app/api/projects/[id]/{design-system,import-files,preview}/route.ts`, `app/api/projects/snapshots/route.ts`
- `app/api/security/scan/webhook/route.ts`, `app/api/cloud/daily-backups/route.ts`, `app/sitemap.ts`
- `app/preview/[projectId]/route.ts`, `app/preview/[projectId]/[...path]/route.ts`, `app/preview/[projectId]/og/route.tsx`
- `components/dashboard/analytics-page.tsx`, `app/(marketing)/p/[username]/[projectSlug]/page.tsx`
- `lib/supabase/client.ts`, `components/pwa/service-worker-registrar.tsx`, `public/sw.js`
- `components/editor/editor-layout.tsx`, `components/editor/editor-top-bar.tsx`, `components/editor/chat-panel.tsx`, `components/editor/preview-panel.tsx`
- `lib/ai/provider.ts`, `lib/ai/skills/route.ts`
- `package.json`, `.env.local`
- migrations: `057`, `058`, `059`, `060` (new); `015`, `019`, `035`, `036`, `039`, `043`, `046` (fixed)
