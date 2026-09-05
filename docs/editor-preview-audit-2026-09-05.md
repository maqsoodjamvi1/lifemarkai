# Editor and preview audit — 5 September 2026

Follow-up: [implemented corrections and verification](./editor-preview-parity-fixes-2026-09-05.md).
The findings below describe the state before those corrections.

## Verdict

LifemarkAI has broad functional overlap with Lovable, but equal reliability,
interaction quality, generated-app quality, and preview performance are **not
established**. The current editor has compile-time defects and preview readiness
signals that can report success before the updated app has rendered. A percentage
parity score would be misleading without a shared acceptance suite.

This is a source audit of the active root application and local regression tests.
It is not an exhaustive security audit or an authenticated production browser
audit. The nested untracked `lifemarkai/` directory and existing patch archives
were not modified. Neither localhost:3000 nor localhost:3001 was accepting the
status request, so no running editor/sandbox first-paint benchmark was available.

## Capability comparison

| Area | Root application evidence | Assessment |
| --- | --- | --- |
| Code editing | `code-panel.tsx`: lazy Monaco, tabs, save integration; `editor-layout.tsx`: serialized per-file persistence and visible save failures | Substantial implementation, not merely a placeholder |
| Plan and build | `plan-panel.tsx`: chat request, plan approval and agent handoff; `chat-panel.tsx`: streaming and clarification handling | Implemented, but clarification type contracts fail type-check |
| Preview toolbar | `lovable/preview-interaction-toolbar.tsx` and `preview-panel.tsx`: select, text, annotate, comments, multi-selection, pending edits, device framing | Broad overlap; interaction fidelity needs browser acceptance tests |
| Visual source edits | `lib/editor/apply-visual-edit.ts`: scoped string matching and AI fallback | Ambiguous/dynamic source requires fallback; do not assume every DOM edit persists deterministically |
| History | `history-panel.tsx`: snapshot listing, creation, restore with dry-run | Real API-backed workflow; restoration reliability not exercised here |
| Testing | `testing-panel.tsx`: execution capability check and SSE test runner | Available only when the deployment supports execution; UI presence does not establish browser-test quality |
| Live preview | `selectPreviewEngine` in `use-preview-engine-policy.ts` | Deliberately sandbox-only; WebContainer/static code is not active automatic failover |
| Editor loading | `lazy-editor-panels.tsx`: dynamic per-panel imports | Useful existing optimization; major editor/preview components still concentrate considerable state and effects |

Lovable's current documented toolbar includes element selection, inline text,
annotations, pinned comments, and queued requests. Code editing and browser testing
are separately documented. These describe advertised behavior, not measured
reliability or proprietary implementation details:

- [Lovable preview toolbar](https://docs.lovable.dev/features/preview-toolbar)
- [Lovable code mode](https://docs.lovable.dev/features/code-mode)
- [Lovable plan mode](https://docs.lovable.dev/features/plan-mode)
- [Lovable browser testing](https://docs.lovable.dev/features/browser-testing)
- [Lovable's discussion of persistent dev servers and HMR](https://lovable.dev/blog/visual-edits)

## Confirmed issues addressed

1. **Excess phase polling and overlapping requests.** Healthy previews previously
   scheduled a phase request every 1.2 seconds, in addition to heartbeat and log
   requests. `poll-preview.ts` now schedules the next request after completion:
   1.2 seconds during boot/errors, 15 seconds when settled. Hidden tabs skip phase
   requests. Cleanup aborts pending work and a request receives an abort after
   15 seconds. Canceled responses cannot change state. Nominal healthy phase
   requests fall from 50 to 4 per minute (92% fewer); this is not a claim of 92%
   faster rendering or total network reduction.
2. **Out-of-order sandbox writes.** The preview effect's superseded flag prevented
   stale UI updates but did not serialize server writes. The new
   `createPreviewFileSync` queue waits for the active write, skips intermediate
   queued snapshots, and sends the newest snapshot next. Failed writes remain
   retryable; identical successful snapshots do not upload again. Ordering is
   local to this mounted editor, not a distributed lock across collaborators.
3. **Manual edit delay.** The sandbox sync debounce is now 250 ms outside AI
   generation, down from 800 ms. Streaming retains the 800 ms batch window.
   This removes 550 ms of intentional waiting at this stage, not necessarily
   550 ms from every user interaction: autosave, file staging, transport and HMR
   still contribute latency.
4. **Late project responses.** State application and boot continuations now reject
   responses captured for a different current project. This narrows project-switch
   races; a browser navigation stress test is still required for full lifecycle
   assurance.

## Remaining findings, ranked

| Priority | Finding and evidence | Consequence / next action |
| --- | --- | --- |
| P1 | `lifemark-cloud-panel.tsx:653` references `CustomEmailsPanel`, with no definition/import found; TypeScript reports the missing identifier | Opening the Emails branch can throw. Restore the intended component integration before declaring the editor release-ready |
| P1 | `chat-panel.tsx` clarification types disagree with the interview/session and message-row types | Clarification integration fails type-check; reconcile contracts and exercise restore/answer/skip flows |
| P1 | `preview-panel.tsx` announces successful settle 600 ms after sync, or 2500 ms during install | A successful write does not prove HMR or rendering succeeded. Correlate each revision with a guest acknowledgement and error/paint observation |
| P2 | `use-sandbox-preview.ts` paint listener accepts `lifemark-preview-painted` without validating the sender origin/window | Unrelated frame messages can satisfy the watchdog. Bind paint evidence to the active iframe and revision |
| P2 | `preview-panel.tsx` still sends full snapshots; sync route performs full-project dependency reconciliation | Large edits retain payload/CPU/database overhead. Keep full context for patching, then implement dependency-aware deltas with server revision ordering |
| P2 | Sync protocol shown in `sandbox-preview/sync.ts` is write-based and has no explicit deleted-path field | Removed/renamed project files can remain in the running sandbox. Add explicit deletion reconciliation and rename tests |
| P2 | Engine policy intentionally ignores fallback choices and returns unavailable without an enabled sandbox | Availability depends on sandbox deployment. Treat this as an explicit product requirement and test pause/resume/provider outages |
| P2 | Monaco loads its runtime from a public CDN | Code editor startup depends on another origin; consider serving pinned editor assets locally and measuring load time |
| P2 | Additional type-check errors include lazy-panel props and profile/GitHub schema typing | The repository-wide type gate is not clean; these are outside the preview performance patch |

Client delta uploads were intentionally not introduced in this patch: the existing
preview patcher synthesizes missing entry/config files based on the supplied
snapshot. Sending an isolated component without full framework context could
overwrite a valid custom scaffold and cause restarts.

## Validation and acceptance gaps

- 228 tests passed across `src/lib/preview/*.test.ts` and the editor component
  utility tests, including the eight new polling and file-sync regression tests.
- The existing preview lifecycle command passed all 25 tests.
- Repository type-check fails on existing editor and other integration errors;
  passing focused tests must not be presented as a clean repository build.
- Focused ESLint reported zero errors and warnings in the existing preview
  components/hooks. The new polling and sync helpers had no lint findings.
- No deployment, paid sandbox creation, AI generation, database mutation, or
  external messaging was performed by this audit.

Before claiming Lovable-equivalent preview speed, use the same app fixtures to
measure cold first visible render, warm reconnect, edit-to-HMR render, dependency
addition, project switching, background-tab resume, and expired-sandbox recovery.
Record p50/p95, console failures, blank frames, and wrong/stale revision renders.
Include a larger project and slow-network cases. Current fixed-delay settle
telemetry is insufficient to certify those timings.
