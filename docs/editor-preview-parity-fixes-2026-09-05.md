# Editor and preview corrections — 5 September 2026

This follows [the source audit](./editor-preview-audit-2026-09-05.md). The original
audit records the starting state; the changes below supersede its defect list.

## Implemented

| Audit concern | Change |
| --- | --- |
| Editor does not type-check | Fixed missing component/type imports, clarification contracts, mode validation, stale panel props, and the GitHub enterprise profile-column type overlay matching existing migration 193 |
| Premature preview success | Each sync returns a revision. An injected module and guest bridge acknowledge it after page load or Vite's completed update batch and two animation frames with visible content. A successful write, iframe load, lifecycle message, bridge startup, or pong no longer satisfies the generation render wait |
| Old app visible after failed HMR | Runtime errors, Vite errors, and relevant console errors invalidate render confirmation. A subsequent application update can clear that failure and verify its new revision |
| Untrusted paint messages | The revision waiter, sandbox watchdog, and editor message handler validate the active iframe window and sandbox origin; the waiter also matches the exact revision |
| Full-project uploads on every edit | First sync sends a full baseline; later syncs send changed paths and deletions against the acknowledged revision. A bounded server cache retains complete source context for dependency/scaffold repair. Cache misses or worker changes request a full resync |
| Out-of-order and redundant writes | Client syncs are serialized and intermediate queued snapshots coalesced. Identical snapshots reuse the acknowledged revision. The route serializes requests per project within its server process |
| Deleted/renamed files remain live | Explicit deleted paths are removed; Docker complete syncs also prune its previously managed files. Deletion rejects traversal, protected directories, and symlinked parent escapes; failed cleanup is surfaced |
| Slow edit scheduling | Manual sync debounce is 250 ms, streaming remains batched at 800 ms, and healthy phase polling is 15 seconds rather than 1.2 seconds. Hidden tabs skip phase polling |
| CDN-dependent code editor | Vite serves and bundles installed Monaco assets at `/monaco/vs`. The code editor and TypeScript worker no longer require a CDN |
| Ineffective annotation lazy loading | Removed the static annotation-modal import that defeated code splitting |
| Live environment writes | The sync endpoint rejects Live writes; the preview panel suppresses sync and visual editing while locked. Sandbox IDs must match project metadata |
| Contradictory fallback claims | Published policy and older infrastructure tests now match the existing sandbox-only product lifecycle. Optional provider selection remains operator controlled |

## Verification

- `npm run type-check`: passed.
- `npm run build`: passed.
- `npm test`: 1,439 passed, 3 skipped, 0 failed (1,442 total).
- Focused ESLint on the new sync/revision code and modified sync route: passed.
- Browser verification: all eight reported scenarios passed.
- Built-server smoke: `/health`, Monaco loader, and Monaco worker returned HTTP
  200; JavaScript assets had the correct JavaScript content type.

The reproducible browser command is:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge' # Or use the installed Playwright Chromium
npm run verify:preview-revision
```

It uses temporary local fixtures, an actual Vite server, and a cross-origin
iframe. It checks initial paint, rejection of an old revision, rejection of an
unrelated sender, HMR without iframe navigation, runtime failure, compile failure,
recovery, and local Monaco loading with a functioning TypeScript worker and no
external requests. Observed small-fixture edit-to-confirmation samples were about
360–425 ms; these are local smoke timings, not production p50/p95 figures.

The filesystem test executes the deletion program against temporary directories:
an ordinary file is removed, while a symlink/junction to an outside file is
rejected and that file remains intact. Unit tests also cover delta merging,
rename handling, cache-miss full retries, polling cancellation, and sync ordering.

## What this establishes

Follow-up: sandbox dependency reconciliation no longer updates saved
`project_files.package.json`. A historical or unsaved preview could previously
overwrite the saved manifest when its imports required dependency repair.
Repairs now stay in the sandbox and are repeated as needed on future syncs.
The repaired file array is also separate from the input source snapshot.
A regression test covers current → historical → current synchronization,
including restoring the current manifest and deleting historical-only files.
All 11 focused sync/snapshot tests passed after this change.

These changes address the concrete defects in the editor audit. They do not
establish that LifemarkAI equals every Lovable capability or its production
reliability. No paid AI generation, hosted sandbox provisioning, deployment,
production database mutation, or authenticated end-to-end customer flow was run.

The revision check confirms visible content after a browser update cycle; it is
not a semantic test of the requested feature and cannot exclude errors that occur
later during user interaction. The backend cache is process-local, with full
resync on a cache miss; the server queue is not a distributed lock across
replicas or all out-of-band agent writes. Docker has complete managed-file
pruning; other providers receive explicit client deletion paths.

The supported product preview continues to require a working server sandbox.
Measure cold boot, warm reconnect, large-project updates, dependency installation,
and pause/resume on the intended deployment before claiming equivalent production
speed. Existing migration 193 must be applied wherever GitHub enterprise profile
configuration is used; the type correction does not apply migrations remotely.
