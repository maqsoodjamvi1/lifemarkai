# Editor UX fix — chat-only left, live preview right

## What was broken

From the screenshot you showed: left panel was rendering raw code blocks
(`import React from 'react'…`), right panel was stuck on the placeholder
("Your app is ready. Start chatting with AI to build it!"). User had no way
to see a running app.

## Two root causes

### 1. JSON-mode failure in build path

When you click Build, the chat route sends `jsonMode: true` and a system
prompt that instructs the AI to return a JSON object with a `files` array.
Some models (especially smaller / community-hosted ones via OpenRouter)
ignore that instruction and return conversational prose with separate
fenced code blocks like:

```
Here's App.jsx:
```jsx
import Login from './Login';
…
```

And here's Login.jsx:
```jsx
…
```
```

The previous `parseAIResponse` had five JSON-recovery strategies. When all
five failed (which they did for prose+multi-fence responses), it returned
`{ files: [], message: raw }`. Empty `files` → preview gets the placeholder
→ user sees nothing rendered.

### 2. Long code blocks defaulted to expanded in chat

Every fenced code block in an AI response rendered expanded by default.
Long generated files dominated the chat panel. Lovable collapses code by
default; chat is for prose.

## What I fixed

### Fix 1 — Strategy 6 in `parseAIResponse`

Added `extractFencesAsFiles()` as a sixth-and-final salvage path in
`lib/ai/code-parser.ts`. When all five JSON strategies fail it now walks
every fenced block and extracts each as a file. Path inference order:

1. A path comment on the line BEFORE the fence (`// src/App.jsx`)
2. A path comment on the first line OF the fence (`// App.jsx` as the body's
   opening comment)
3. A derived name from the language tag (`src/file1.jsx`, `src/file2.tsx`…)

Blocks shorter than 3 lines are skipped — they're inline snippets, not
files. The prose before the first fence becomes the assistant `message`.

Effect: when the AI returns the prose+fence shape you saw in the screenshot,
the chat route now extracts the files, writes them to Supabase, and the
preview iframe receives them. You'll see the running app instead of the
placeholder.

### Fix 2 — Default-collapse long code blocks in chat

In `chat-panel.tsx`, `ChatCodeBlock` now defaults to collapsed when the
block is more than 8 lines. Short snippets (≤8 lines) stay expanded
because they're usually quick references the user wants to see inline.
A collapsed block shows `<language> · N lines` with a ▼ chevron; click to
expand.

## Files changed

| File | Lines | Change |
|---|---|---|
| `lib/ai/code-parser.ts` | added ~50 | new `extractFencesAsFiles` helper + Strategy 6 in `parseAIResponse` |
| `components/editor/chat-panel.tsx` | line 308 | `useState(lineCount > 8)` instead of `useState(false)` |

No new dependencies. No new env vars. No new migrations.

## What this does NOT fix

A few related improvements I deliberately left out of this patch:

- **Build-mode chat should ALSO display a build summary card** — "Created
  3 files, modified 1" with file chips — instead of just showing the
  prose+code response. That's a UI restructure for `chat-panel.tsx`'s
  assistant-message renderer; worth a focused follow-up.
- **The preview placeholder copy** ("Your app is ready. Start chatting with
  AI to build it!") is misleading when files exist but the build failed.
  Should say "Build failed — open the Code tab to see what was generated"
  with a button to switch tabs. Same follow-up.
- **System prompt hardening** — `APP_GENERATION_SYSTEM_PROMPT` could include
  a verbatim JSON skeleton + "Respond with ONLY the JSON object, no prose
  before or after" reminder. Currently the constraint is there but some
  models still ignore it. The Strategy 6 rescue handles it instead.

## Verification

After applying these changes:

1. Stop the dev server, clear caches:
   ```powershell
   cd D:\Projects\lifemarkai
   Remove-Item -Recurse -Force .next, .turbo -ErrorAction SilentlyContinue
   npm run dev
   ```
2. Open any project, send a build prompt like "make a login form with email
   and password".
3. Even if the AI returns prose + code fences (instead of JSON), the preview
   should now load — refresh it manually with the refresh icon if needed.
4. Chat panel: long files now appear as collapsed `<lang> · N lines` chips.
   Click to expand.

If the preview is still blank but files clearly exist in the editor's Code
tab, the issue is in `buildFallbackHtml`'s Babel transformation pipeline
(separate from this fix). Open DevTools Console on the preview iframe and
look for a Babel compile error — that'd be the next thing to chase.
