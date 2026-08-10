# Backend strategy — decision record

**Status:** accepted (Aug 2026) · **Owner:** Maqsood

## Decision

One backend contract: **Supabase**. Three tiers, all already built:

| Tier | What | Cost to us | Cost to client | When |
|------|------|-----------|----------------|------|
| 1. LifemarkData | Shared `app_data` table + injected SDK | ~zero | zero | Default for every static app |
| 2. BYO Supabase | Client's own free Supabase project via the DB wizard | zero | zero (their free tier) | Client needs real auth/private data/email |
| 3. Lifemark Cloud | We provision a dedicated Supabase project per app | our bill (2 free, then paid org) | (bundled into premium) | After testing; premium clients only |

Full-stack upgrades ("upgrade to full-stack") are **gated on provisioning
readiness** — with `SUPABASE_ORG_ID` unset, the AI declines gracefully instead
of building an app whose backend can't connect. Setting that env var is the
single switch that enables tier 3.

## Rejected (for now) — with reasons

- **Firebase**: free tier is fine (50K MAU) but NoSQL — our entire AI contract
  (SQL migrations, RLS policies, shared client scaffold) would need a parallel
  second implementation. Two backend contracts = double the ways generated
  apps can be wrong.
- **Appwrite / Nhost**: free tiers pause after 7 idle days; self-hosting them
  is running infrastructure we don't need while BYO Supabase is free.
- **PocketBase**: the back-pocket option. Truly free forever, single binary,
  could host one per client app on our own VPS. Revisit ONLY if BYO signup
  friction proves to be a real client blocker — it needs a new AI prompt
  contract (SQLite, rules instead of RLS) and a new wizard.
- **Neon**: not a backend (no auth/storage), but noted as the free Postgres
  home for a future "one shared DB, per-app schemas" LifemarkData scale-up.

## Client onboarding — BYO Supabase (tier 2)

Send clients this checklist (10 minutes, one time):

1. Create a free account at supabase.com → **New project** (any name/region;
   save the database password somewhere safe).
2. In the Supabase dashboard: **Project Settings → API** — copy two values:
   the **Project URL** and the **anon public key**.
3. In the LifemarkAI editor: open the **DB panel** (Supabase wizard) → paste
   both values → Connect. The AI now builds against their real database.
4. For transactional email: create a free resend.com account, copy the API
   key, and add `RESEND_API_KEY` in the **Env panel**. The connector proxy
   keeps the key server-side.

Their data lives in their account, on their quota (50K auth users, 500 MB DB
free) — we never hold it and never pay for it.

## Review triggers

Revisit this decision when any of these happens:
- BYO onboarding measurably loses clients (→ evaluate PocketBase self-host).
- A client's app outgrows Supabase free tier (→ they upgrade their own account).
- Tier-3 demand exceeds 2 concurrent apps (→ paid Supabase org, priced into plans).
- LifemarkData `app_data` grows past ~1 GB total (→ Neon shared-Postgres design).

## Per-app server functions — DEFERRED (Base44 parity #3, Aug 2026)

Base44 offers Deno serverless functions so a no-build app can still receive
webhooks or run scheduled jobs. That would be the middle rung between tier 1
(LifemarkData) and tier 3 (full TanStack + provisioned Supabase) — but it
means operating a sandbox that executes untrusted generated code: the same
class of infra cost and attack surface we just removed with Modal.

**Decision: do not build it now.** The edge-functions panel is the natural UI
if/when this changes.

Review trigger: more than ~3 real client requests for "my static app needs a
webhook / scheduled job" within a month → revisit, starting from Supabase Edge
Functions on the client's own BYO project (tier 2) rather than our own runner.

## Pricing notes (Base44 parity #4)

When plans get priced, meter BUILD separately from RUN:
- Build actions (AI generations/edits) — the cost driver today; per-credit.
- Runtime (app_data rows/requests via the public API) — cheap but unbounded;
  cap per tier instead of metering (e.g. free: 1K rows/collection, the current
  hard cap) so one heavy app can't silently eat margin.
Lesson from Base44 reviews: their #1 complaint is unpredictable credit burn —
keep our pricing flatter and predictable; do NOT copy per-operation billing UX.
