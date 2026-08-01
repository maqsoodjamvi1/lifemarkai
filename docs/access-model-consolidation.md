# Consolidating the access model

**Status:** proposal, not started. Written 2026-08-01 after a live investigation
into why published apps returned 404.

## The problem in one line

Three columns answer "who can see this app", only one of them is enforced, and the
one the publish UI writes is not it.

## Current state, as measured

| Field | Type | Written by | Read by | Enforced? |
|---|---|---|---|---|
| `projects.is_public` | boolean | project create, remix, templates, demo seed | RLS policies `projects_public`, `projects_public_view`, `Public remix projects visible to all` | **Yes — this is the only real gate** |
| `projects.visibility` | text (`public` / `workspace` / `private`) | publish panel → `PATCH /api/projects/:id` | `lib/public-server.ts`, `routes/preview-by-slug/$.ts` | No |
| `projects.publish_audience` | text (4 modes) | `/api/projects/:id/publish-audience` | `evaluatePublishAudience`, `/api/embed/access` | In app code only |

Verified against the live database on 2026-08-01:

- 25 projects had `visibility='public'` with `is_public=false`. RLS hid all of them
  from anonymous visitors, so `/app/:slug` returned 404 even though the owner had
  marked the project public. Four real ones were backfilled by hand; 21 test
  artifacts were deliberately left alone.
- `PATCH /api/projects/:id` writes `visibility` without syncing `is_public`.

### Correction (2026-08-01, after reading `updateProject`)

An earlier draft of this document claimed the PATCH route "forwards the entire
request body with no field allowlist" and used that to argue against a sync fix.
**That was wrong.** `updateProject` has `PROJECT_UPDATE_FIELDS`, rejects any
unknown key outright, and lists BOTH `visibility` and `is_public` in
`OWNER_ONLY_PROJECT_FIELDS` — so only the project owner can write either.

The write path is properly gated. The defect is narrower than described: the owner
can set the two fields independently and nothing keeps them consistent. The publish
panel sets only `visibility`, so they drift.

This also removes the objection to fixing it in `updateProject` directly: deriving
one field from the other introduces no new security surface, because both were
already owner-only. Step 1 below was rewritten accordingly.

### A correction to existing documentation

The header comment in `lib/project/publish-audience.ts` states that `visibility` is
"a field that route does not handle, against a column that does not exist." The
column **does** exist and is populated on 80+ rows. That comment is wrong and is
actively misleading, because it sits in the file that describes access control.
Fix it as part of this work.

## Why not just add a trigger

The obvious quick fix — a trigger mirroring `is_public` from `visibility` — stops
the 404s recurring, and was rejected for two reasons:

1. It **cements a third redundant field** into the schema rather than removing the
   ambiguity.
2. It makes `visibility` security-relevant while `PATCH /api/projects/:id` still
   accepts arbitrary keys with no allowlist. Wiring an unvalidated write path
   directly to an RLS-gating column is the wrong direction.

## Target state

One model: **`publish_audience`**. It is the newest, has four modes, has its own
grants table (`project_publish_grants`, migration 157), and a fail-closed
evaluator. `visibility` and `is_public` collapse into it.

```
publish_audience:  public | workspace | invite_only | private
```

## Migration order

Each step is independently reversible, and nothing is dropped until the step after
it has been verified in production.

**1. Add a field allowlist to `PATCH /api/projects/:id`.**
Independently correct regardless of the rest of this plan — an endpoint that writes
whatever it is handed should not exist. Verify: a PATCH containing `is_public` or
`publish_audience` is rejected or ignored, and a normal rename still works.

**2. Backfill `publish_audience` from the existing fields.**
Precedence: existing `publish_audience` wins; else map `visibility`; else
`is_public ? 'public' : 'private'`. Read-only for the app at this point — nothing
depends on it yet. Verify: row counts per mode match the source fields, and no row
is left null.

**3. Add RLS policies gating on `publish_audience`, ALONGSIDE the existing ones.**
Both sets active means access can only widen, never narrow, so this step cannot
lock anyone out. Verify: anonymous read of a `public` project still works; a
`private` project is still hidden.

**4. Point every read site at `publish_audience`.**
`lib/public-server.ts`, `routes/preview-by-slug/$.ts`, `routes/app/$slug.tsx`,
`lib/project/access.ts`. Verify: `/app/:slug` resolves for each of the four modes
with the right outcome — including a logged-out visitor on `workspace`, which must
redirect to login rather than 404.

**5. Remove the old RLS policies.**
This is the first step that can narrow access. Verify before and after with the
same matrix as step 4, and check the 21 test projects do not suddenly become
visible.

**6. Drop `visibility` and `is_public`.**
Only after steps 1–5 have been live long enough to trust. Run the repo-wide schema
sweep first — it will list every remaining reference.

## Verification tooling that already exists

- The schema sweep (built 2026-08-01) compares every column reference in `routes/`
  and `lib/` against live `information_schema`. Run it after steps 4 and 6; it
  catches exactly the class of bug that caused this.
- `/api/embed/access` already exercises `evaluatePublishAudience` and is a
  convenient end-to-end probe for step 3 onward.

## Risks

- **Step 5 is the only one that can lock users out.** Do it separately, and be
  ready to re-add the old policies — they are two `CREATE POLICY` statements.
- **The 21 test projects** (`hello-e2e-*`, `quality-test-*`, `sse-disconnect-test-*`,
  `parity-chat-*`) carry `visibility='public'`. Under step 2's mapping they become
  `publish_audience='public'`. Delete them first, or exclude them explicitly, or
  they become genuinely reachable.
- **`remix_enabled`** participates in one existing RLS policy
  (`is_public AND remix_enabled`). Decide whether remixability stays a separate
  concern or folds into the audience model; do not lose it silently.
