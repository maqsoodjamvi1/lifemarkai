# Preview pipeline fixes

## What changed

Three patches in `components/editor/preview-panel.tsx`:

### 1. Iframe re-keys on content changes

```tsx
key={`${refreshKey}-${fallbackHtml.length}`}
```

instead of just `key={refreshKey}`. **Why**: browsers don't reliably reload
an existing iframe when only `srcDoc` changes — you have to mount a fresh
DOM element. Tying the key to the rendered HTML length forces a new mount
every time the bundle changes.

### 2. Diagnostic HTML when build pipeline fails

`buildFallbackHtml` previously returned the generic "Start chatting" empty
state in two error paths:

- When `files.length > 0` but no `.tsx/.ts/.jsx/.js` files exist
- When code files exist but no `App.tsx`/`App.jsx` entry point

Both now return `buildDiagnosticHtml(title, detail)` instead — an actual
explanation of what was found, so you can see the gap between what was
generated and what the bundler needs. The previous "Start chatting"
behaviour is reserved for `files.length === 0` (truly nothing generated).

### 3. Previously: Strategy 6 fence extraction in code-parser

(From the earlier `EDITOR_UX_FIX.md`.) When the AI returns prose+fenced
code blocks instead of pure JSON, `parseAIResponse` now extracts each
fence as a `ParsedFile` so files DO reach the project_files table. Without
that fix, the preview would have nothing to render even after this patch.

## How to diagnose if preview is still blank

The diagnostic now tells you WHY:

| Shown text | Meaning |
|---|---|
| "Your preview will appear here" | `files.length === 0` — no files generated. Check the chat for an error in the AI response. |
| "No renderable code files found" | Files exist but none are .tsx/.ts/.jsx/.js. The AI generated .md, .css, .json, etc. but nothing executable. Ask the AI to make App.tsx. |
| "No entry file found" | Code files exist but no `App.tsx`, `App.jsx`, or `src/App.tsx`. Lists what IS there. Ask the AI to rename the entry, or check if the file is at an unexpected path. |
| App actually renders | Everything worked. |
| Runtime error inside the iframe | Open DevTools, click into the iframe context (Sources tab → drop-down at top), Console will show the Babel runtime error. Usually a missing import or typo. |

## How to verify the fix end-to-end

1. Restart the dev server with caches cleared:
   ```powershell
   cd D:\Projects\lifemarkai
   Remove-Item -Recurse -Force .next, .turbo -ErrorAction SilentlyContinue
   npm run dev
   ```
2. Open a project. Send a build prompt: "create a simple counter app".
3. Wait for the build to complete. Either:
   - **You see a running counter** → all three fixes working
   - **You see "No entry file found" with file paths listed** → AI didn't name its entry file App.tsx. Tell it to. The diagnostic at least shows you what's there.
   - **You see "Your preview will appear here"** → files truly didn't reach the panel. Check the chat-panel handler's `onFilesUpdate` call (line 1664 of chat-panel.tsx) is being reached. The most likely cause was the JSON parse failure; the Strategy 6 rescue from EDITOR_UX_FIX.md should have fixed that.

## What this does NOT fix

- **A build error inside the iframe.** Babel-standalone reports compile
  errors via `console.error` inside the iframe. If you see a white screen
  in the preview iframe, open DevTools and switch the Console context to
  the iframe — the actual error is there. The diagnostic HTML only fires
  when `buildFallbackHtml` itself can't produce a runnable doc.
- **Imports for libraries not in the CDN allowlist.** If the AI imports
  `@my-org/random-lib`, the `__Mrequire` registry can't resolve it. Add
  it to the registry function in `preview-panel.tsx` (around line 494)
  or pin it to a CDN if it's a common package.
- **Sandpack-based preview.** That path is intentionally stubbed off
  (`setSandpackReady(false)` at line 763) because Sandpack requires the
  CodeSandbox CDN which causes timeouts on some networks. Re-enable it
  by installing `@codesandbox/sandpack-react` and removing the stub at
  the top of the file.
