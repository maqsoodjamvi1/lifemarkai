# LifemarkAI Repo — Duplicates & Orphans Audit

_Import-graph scan of `app/ components/ lib/ hooks/ store/ types/` (594 source files). An "orphan" = zero inbound imports and not a Next.js entrypoint. Verified against dynamic/aliased imports and package scripts._

**Headline:** No byte-identical duplicate files. Most "same-name" hits (`route.ts`, `page.tsx`, `layout.tsx`, `client.ts`, `badge`) are Next.js conventions or unrelated modules — not real duplicates. There is **one true duplicate** and a set of genuinely **unreferenced files**, several of which are intentional.

---

## 1. Not orphans — leave alone (false positives)

- `lib/ai/code-parser.test.ts`, `lib/ai/skill-matcher.test.ts`, `lib/security/static-scan.test.ts` — test files, run by the test runner, never imported.
- `types/declarations.d.ts` — ambient TypeScript declarations, loaded via `tsconfig` `include`, never imported.

## 2. Verify before removing (may be non-import entrypoints)

- `lib/queue/deploy-worker.ts` — a BullMQ worker. Workers are typically launched as a **separate process** (`node …deploy-worker`), not imported, so "0 refs" doesn't mean dead. Confirm it isn't started by a Procfile / PM2 / cron / container command before deleting.
- `lib/run-script.ts` — name suggests a CLI/script entrypoint. Confirm nothing invokes it out-of-band.

## 3. Intentional rollback code — keep unless you want a clean-up

`app/(marketing)/page.tsx` now renders `LovableStyleLanding`, and its own comment says the old per-section components are **"still in components/marketing/ — re-import them here to roll back if needed."** So these are deliberately retained:

- `components/marketing/hero-section.tsx`
- `components/marketing/features-section.tsx`
- `components/marketing/cta-section.tsx`
- `components/marketing/how-it-works-section.tsx`
- `components/marketing/testimonials-section.tsx`

Remove only if you've committed to the new landing and don't want the rollback path.

## 4. Component-library primitives — safe to keep or remove

- `components/ui/alert.tsx`, `components/ui/sheet.tsx` — shadcn/ui primitives not currently imported. Harmless to keep as library; safe to remove if you prefer a lean `ui/`.

## 5. Confirmed dead code — safe to remove

> **STATUS: REMOVED (this session).** The 13 files below were deleted after a per-file guard re-confirmed zero imports. `store/app-store.ts` and `components/ui/fx-button.tsx` were intentionally KEPT for an explicit decision. Post-delete grep found no dangling imports. **Follow-up:** `components/dashboard/branded-urls-section.tsx` was imported only by the now-deleted `workspace-branding-page.tsx`, so it is a **new chain-orphan** (and still carries a stale `Mount: imported into workspace-branding-page.tsx` comment) — remove it too if you want the cleanup complete.

Zero inbound references, verified no dynamic/aliased import, not an entrypoint:

**True duplicate**
- `components/editor/activity-feed.tsx` — duplicates the **live** `components/dashboard/activity-feed.tsx` (1 ref). The editor copy is unused.

**Unused components**
- `components/editor/cloud-panel.tsx`
- `components/editor/sandpack-wrapper.tsx`
- `components/dashboard/project-insights-card.tsx`
- `components/dashboard/projects-with-groups.tsx`
- `components/dashboard/recently-visited.tsx`
- `components/dashboard/workspace-branding-page.tsx`
- `components/templates/templates-grid.tsx`
- `components/ui/fx-button.tsx` — **created this session but never wired in** (the editor top-bar didn't end up importing `FxButton`). Either wire it in or drop it.

**Unused hooks**
- `hooks/use-credits.ts`
- `hooks/use-project.ts`

**Unused lib modules**
- `lib/ai/streaming.ts`
- `lib/domains/hosting.ts`
- `lib/validations.ts`

**Unused store**
- `store/app-store.ts` — the Zustand store `CLAUDE.md` documents as the app's state store. Nothing imports it anymore → the app migrated off it. If confirmed dead, `CLAUDE.md`'s "State: Zustand + TanStack Query" note is stale.

---

## Notes & caveats

- This is a **static** import scan. It resolves literal `import`/`require`/`import()` specifiers (relative + `@/` alias) and accounts for Next.js special files. It cannot see imports built from runtime variables, or references only in non-scanned files (MDX, generated code). Treat §5 as high-confidence and §2 as "confirm first."
- These are **source files with unpushed changes already pending** — deleting them is a real (version-controlled, recoverable) change. Nothing here has been deleted.
- Suggested safe first cut: everything in §5 **except** `store/app-store.ts` and `components/ui/fx-button.tsx` (decide those explicitly) — that's ~13 files of clear dead code, no behavior change.
