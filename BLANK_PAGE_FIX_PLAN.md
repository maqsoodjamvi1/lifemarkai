# Blank-page fix plan — final

## What I just fixed in code

Three real bugs landed in chat-panel.tsx this session. All three are now patched in your working copy.

| Bug | Where | Why it matters |
|---|---|---|
| `ReferenceError: assistantId is not defined` | line 1529 — `patches_applied` SSE handler referenced `assistantId` before it was declared | Throws at runtime when patch mode streams patches in. Would silently break chat for users in patch mode. |
| `mode: effectiveMode` type mismatch (user message) | line ~1402 | TypeScript error; would block prod build via `next build` even though dev with Turbopack often skips strict type checks. |
| `mode: effectiveMode` type mismatch (assistant message) | line ~1712 | Same root cause as above. |

Plus the earlier fix for the **refractor / react-syntax-highlighter Turbopack issue** — `dist/cjs/styles/prism` → `dist/esm/styles/prism` at line 8.

## What I deliberately did NOT touch

The full type check surfaced ~30 other errors. They are **all pre-existing**:
- `components/editor/connector-wizard-panel.tsx` — missing `color` field on 7 connector definitions
- `components/editor/editor-layout.tsx` — 11 prop-mismatch errors where panel components changed shape but editor-layout's call sites didn't update

These have been in the codebase since before this session. They surface as TypeScript warnings but Next 16 with Turbopack will boot despite them. **They are not the cause of your blank page.** Fixing them is worthwhile but separate work.

## Apply these in this exact order

```powershell
cd D:\Projects\lifemarkai

# 1. Make sure the dev server is stopped (Ctrl+C in its terminal)

# 2. Nuke ALL caches
Remove-Item -Recurse -Force .next, .turbo -ErrorAction SilentlyContinue

# 3. Unregister the service worker (it's caching old chunks)
#    F12 in browser → Application tab → Service Workers → Unregister
#    Application tab → Storage → Clear site data

# 4. Restart dev server
npm run dev
```

Then:

5. **Hard-reload the browser** with Ctrl+Shift+R
6. **Open `http://localhost:3000/health`** first — that's the diagnostic page I shipped. It tells you whether env vars and Supabase are working. If health is green and the main app is still blank, the cause is in a specific route's component tree (editor or dashboard).

## If the page is still blank after step 6

Open DevTools Console (F12 → Console) and paste the first red error message. The fixes I just made resolve the most likely culprits but not all possible causes. The remaining suspects:

| Symptom in Console | Likely cause | Fix |
|---|---|---|
| `ReferenceError` or `is not defined` | Server-side env var missing | Check `.env.local` has the four required vars |
| `Failed to fetch` or `NetworkError` | API route 500 | Check the dev-server terminal output for the stack trace |
| `Hydration failed` | Server / client mismatch | Usually safe to ignore as warning; if it crashes, paste it |
| Empty Console + empty Network responses | Service worker still serving stale | Go back to step 3 and unregister it harder — also try in an Incognito window |

## What was the root cause of the original blank page?

Most likely a combination: the **refractor chunk-graph error** was breaking the editor render, and the **stale service worker** was preventing the new code from loading after I patched things. The three new bugs I just found in chat-panel.tsx would have surfaced as runtime errors once you reached the editor, but they wouldn't blank the marketing page.

So:
- If `/` (the marketing page) was blank → service worker + cache. Steps 2–5 fix it.
- If only `/editor/<id>` was blank → the refractor fix + the assistantId fix solve it.
- If `/dashboard` was blank → probably a different issue; check Console for the actual error after the cache flush.

`/health` (the diagnostic page I shipped) deliberately has no providers and no auth helpers, so if even that page is blank, the problem is in `app/layout.tsx` itself or the build is broken — run `npm run build` and read the error.
