# LifemarkAI bug triage — 2026-06-01

> Initial sweep. Captures both **known bugs already fixed this session** (so
> they don't get re-introduced) and **patterns I found** that suggest more
> bugs lurking. Not exhaustive — 100+ panel files can't all be read
> responsibly in one pass. Treat this as a starting backlog, not a final
> inventory.

## Methodology

Targeted greps + reads on the highest-risk files. Three signal patterns:
- `@ts-nocheck` (TypeScript errors suppressed entirely)
- `TODO` / `FIXME` / `HACK` markers
- `console.error` (often left over from debug runs)

Plus the 14 bugs I personally fixed this session — those are the existence
proof that more like them exist.

## Already fixed this session

These are guarded — verify they don't regress.

| # | Location | What was broken | Fix |
|---|---|---|---|
| 1 | `chat-panel.tsx` line 8 | `react-syntax-highlighter` imported from `dist/cjs/styles/prism` → Turbopack refractor chunk-graph failure | Switched to `dist/esm/styles/prism` |
| 2 | `chat-panel.tsx` line 1529 | `assistantId` referenced in `patches_applied` SSE handler before being declared | Stash under `__pending`, reconcile on `data.done` |
| 3 | `chat-panel.tsx` lines 1402 + 1712 | `EditorMode` includes `"patch"` but `Message['mode']` doesn't | Cast `"patch"` → `"build"` at message-creation sites |
| 4 | `chat-panel.tsx` SSE handler | Server emitted `streamedFile` events; client had no handler | Added `serverStreamedPathsRef` + new SSE branch |
| 5 | `chat-panel.tsx` data.done | Gated re-fetch on `data.files.length > 0`; missed streaming-only case | Now re-fetches when paths were streamed even with empty data.files |
| 6 | `app/api/ai/chat/route.ts` data.done | `files: parsedFiles` was empty when `parseAIResponse` failed even though streaming extractor wrote files | Reconstruct `finalFilesForClient` from `streamedFilePaths` + DB |
| 7 | `lib/ai/provider.ts` `generateOpenRouter` | `jsonMode: true` dropped silently → AI returned prose+fences | Forward `response_format: json_object` to both streaming + non-streaming OpenRouter paths |
| 8 | `lib/ai/system-prompts.ts` `APP_GENERATION_SYSTEM_PROMPT` | JSON example wrapped in ```` ```json ```` fence → AI mimicked it on output | Re-framed as "Raw JSON only. Start with {. End with }." |
| 9 | `lib/ai/code-parser.ts` Strategy 6 | Path-label regex missed backtick-wrapped paths (Lovable-style `` `src/App.tsx` ``) | Expanded to 6 path-label shapes (// # <!-- backtick bold bare) |
| 10 | `preview-panel.tsx` iframe | `srcDoc` updates didn't reload existing iframe | `key={refreshKey}-${fallbackHtml.length}` |
| 11 | `preview-panel.tsx` `buildFallbackHtml` | Returned generic EMPTY_HTML even when files existed | New `buildDiagnosticHtml(title, detail)` with file-path listing |
| 12 | `preview-panel.tsx` URL bar | Hardcoded `preview/${projectId}`, didn't reflect iframe location | postMessage handshake; editable input that commits on Enter |
| 13 | `lib/supabase/client.ts` | Each `createClient()` made a new browser client → auth lock stolen errors | Singleton on `globalThis.__lifemark_supabase_browser_client` |
| 14 | `marketing/navbar.tsx` | Sign in button had no idle color (ghost variant against transparent header) | Added `text-foreground hover:text-foreground` |
| 15 | `app/globals.css` | Hero stuck at `opacity:0` if framer-motion hydration failed → black screen | CSS fallback: section motion children reveal after 1.5s |

## Pattern: 8 files with `@ts-nocheck`

`@ts-nocheck` disables TypeScript for the entire file. **These are
guaranteed bug-harboring locations** because they hide real type errors.

| File | Risk |
|---|---|
| `components/editor/domains-panel.tsx` | Medium — domain verification flow, complex |
| `components/editor/lifemark-cloud-panel.tsx` | Medium — backup / restore UI |
| `components/editor/webcontainer-preview.tsx` | High — stub for unused webcontainer path; should be deleted or properly typed |
| `components/dashboard/inbox-page.tsx` | Low — fetched and verified clean |
| `components/dashboard/settings-page.tsx` | Medium — account settings, broad surface |
| `components/dashboard/analytics-page.tsx` | Low — fetched and verified mostly clean |
| `components/dashboard/notification-bell.tsx` | Medium — visible component, every page |
| `components/providers/theme-provider.tsx` | Low — third-party wrapper |

**Recommended action:** remove `@ts-nocheck` one file at a time, fix the
errors that surface, re-test. Each file is ~30-90 minutes of work.

## Pattern: 3 files with TODO/FIXME/HACK markers

10 total markers across these files:

| File | Count |
|---|---|
| `components/editor/code-ownership-panel.tsx` | 3 |
| `components/editor/connector-wizard-panel.tsx` | 3 |
| `components/editor/performance-panel.tsx` | 4 |

Read each, see what was deferred. Usually one of: missing API integration,
half-built UI, known edge case.

## Pattern: Pre-existing tsc errors I deliberately did NOT fix

From the earlier deep audit (tsc run against the whole project):

| File | Count | Type |
|---|---|---|
| `components/editor/connector-wizard-panel.tsx` | 7 | Missing `color` field on connector definitions |
| `components/editor/editor-layout.tsx` | 11+ | Panel-prop mismatches — components changed shape, call sites didn't |

These were pre-existing before this session. Next.js with Turbopack boots
despite them. Each one is a real type error that could mask a runtime bug
when the user opens that particular panel.

## Recommended sprint plan

### Sprint 1 — Strip @ts-nocheck (3 days)

One file per session:
- Day 1 morning: `webcontainer-preview.tsx` (delete if unused, type if used)
- Day 1 afternoon: `domains-panel.tsx`
- Day 2 morning: `lifemark-cloud-panel.tsx`
- Day 2 afternoon: `settings-page.tsx`
- Day 3 morning: `notification-bell.tsx`
- Day 3 afternoon: spot-check the remaining three

### Sprint 2 — Pre-existing tsc errors (2 days)

- `connector-wizard-panel.tsx` — add the missing `color` field to all
  connector definitions (or make `color` optional in the type — your call)
- `editor-layout.tsx` — walk through each panel prop mismatch and either
  add the missing prop to the panel component or remove it from the call
  site if it's truly unused

### Sprint 3 — Manual click-through (3 days)

Open the editor as a real user. Click every panel in the right-bar
overflow menu. Click every tab in every settings page. Note any panel
that:
- Renders blank
- Shows a console error on open
- Has a button that doesn't do anything
- Has a form that doesn't submit

For each, decide: is this a P0 bug (renders nothing) or P2 polish (works
but UI cosmetic).

## What I'm NOT recommending

- **Adding more features.** The codebase ships 18 things Lovable doesn't.
  More features is not the leverage point right now.
- **Re-running the Lovable comparison.** It's been done 4 times this
  session. The answer is parity-or-better. Move on.
- **Re-architecting anything.** The bugs found this session were all
  small surgical issues. The architecture is sound.

## Verification commands

After each fix session:

```powershell
cd D:\Projects\lifemarkai
node --test lib/security/static-scan.test.ts     # 16/16 should pass
node --test lib/ai/skill-matcher.test.ts         # 12/12 should pass
node --test lib/ai/code-parser.test.ts           # 8/8 should pass once tests are in
npm run lint                                      # warnings, not errors
npx tsc --noEmit                                 # strict check
```

## Open questions for you

1. Do you want me to start on Sprint 1 (strip @ts-nocheck) right now, or
   move on to something else?
2. Are there specific panels you know are broken from real use? Those
   should jump the queue regardless of static-analysis findings.
3. Is there a deploy target you'd like me to walk through end-to-end
   (e.g. "build a todo app, deploy it to Netlify, verify it loads") as a
   smoke test? That would surface integration bugs that static analysis
   can't catch.
