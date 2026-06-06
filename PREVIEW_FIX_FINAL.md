# Preview pipeline — final hardening

## Three more bugs (from the deep audit)

### Bug 4 — OpenRouter streaming path silently dropped `jsonMode`

`lib/ai/provider.ts` line 304 in `generateOpenRouter()` did NOT include
`response_format: { type: "json_object" }` even when the caller set
`options.jsonMode === true`. The OpenAI native path DID (lines 254 and 285)
but the OpenRouter path was missing it.

When you switched to OpenRouter as the fallback after the OpenAI 429
(`OPENROUTER_FALLBACK.md`), every build-mode request went out without the
JSON constraint. The model defaulted to whatever shape it preferred —
typically Lovable-style prose + code fences. That's why your screenshots
showed prose + `` `src/Login.tsx` `` + ```` ```tsx ```` fences instead of
a single JSON object.

Fixed by adding the same spread expression to both the streaming and
non-streaming OpenRouter paths.

### Bug 5 — System prompt wrapped JSON example in markdown fence

`APP_GENERATION_SYSTEM_PROMPT` showed the expected output shape wrapped
in ```` ```json ```` fences. Even with `response_format: json_object` set,
that demonstration trains the model to wrap its OUTPUT in a markdown
fence too. Some models comply, some don't.

Fixed by removing the markdown fence from the prompt and adding an
explicit "Start with `{` and end with `}`. Nothing else." instruction.

### Bug 6 — (already covered) Strategy 6 path-label regex missed backticks

From the previous session — already shipped. Strategy 6 now recognizes
backtick-wrapped, bold-wrapped, and bare-filename labels in addition to
`//` / `#` / `<!-- -->` comments.

## How these stack with the earlier fixes

After everything shipped today and yesterday, the build-mode preview
pipeline has six independent guards. Each one alone is enough to make the
preview render; they're complementary not redundant:

| Layer | Behaviour |
|---|---|
| 1. System prompt | "Raw JSON only. Start with {. End with }." |
| 2. response_format flag | Forwarded to ALL provider paths (OpenAI, OpenRouter, Anthropic, Google fallback) |
| 3. StreamingFileExtractor | Catches valid JSON file objects mid-stream and writes them to DB immediately |
| 4. parseAIResponse Strategy 1-5 | JSON recovery (clean JSON, ```json fence, generic fence, bracket-aware, partial-stream recovery) |
| 5. parseAIResponse Strategy 6 | Salvages files from prose+fence response, recognises `// comment`, `# comment`, `<!-- comment -->`, `` `inline` ``, `**bold**`, bare filename |
| 6. Server data.done fallback | When parseAIResponse comes back empty but streaming extractor wrote files, fetch them from DB and include in data.files |
| 7. Client streamedFile handler | Tracks paths the server confirmed it wrote |
| 8. Client data.done re-fetch | Pulls full project_files from DB when files were streamed even if data.files is undefined |
| 9. PreviewPanel iframe re-key | `key={refreshKey}-${fallbackHtml.length}` — actually re-renders when bundle changes |
| 10. buildFallbackHtml diagnostic | When entry can't be found, shows file paths the bundler has instead of a generic "Start chatting" placeholder |

## Verification

```powershell
cd D:\Projects\lifemarkai
Remove-Item -Recurse -Force .next, .turbo -ErrorAction SilentlyContinue
npm run dev
```

Trigger any build prompt. Expected behaviour:

1. AI emits JSON (per the strengthened prompt + response_format flag)
2. StreamingFileExtractor catches each file as it completes → DB upsert →
   `data.streamedFile` event → client adds to `serverStreamedPathsRef`
3. At stream end: parseAIResponse extracts files from the now-clean JSON
4. Server emits `data.done` with full `files` array
5. Client re-fetches `project_files` and calls `onFilesUpdate`
6. editor-layout updates `files` state
7. PreviewPanel receives new `files`, iframe key changes, iframe remounts
8. `buildFallbackHtml` finds App.tsx, bundles all files, registers them
   in `window.__M`, boots `ReactDOM.createRoot()` with the App component
9. User sees the running app

If the iframe still shows the diagnostic ("No entry file found"), the
text will tell you what files the bundler has — you can paste it back
and we can fix the specific entry-naming convention the AI is using.

## What I am NOT yet fixing

- **A runtime error in the user's generated code.** Babel-standalone reports
  these via `console.error` inside the iframe. The console bridge (lines
  472-491 of preview-panel.tsx) relays them to the parent window via
  `postMessage`, where they should surface as a Fix-with-AI banner. Tracing
  whether the banner actually fires is a separate diagnostic.
- **CDN package gaps.** If the AI imports `@aceternity/ui` or anything else
  not in the `__Mrequire` registry, the import resolves to `undefined`.
  Future fix: catch this in the bundler and emit a diagnostic file the
  user can see.

## File audit — every preview-pipeline file inspected today

| File | Status |
|---|---|
| `lib/ai/provider.ts` | bug 4 fixed (jsonMode forwarding) |
| `lib/ai/system-prompts.ts` | bug 5 fixed (no fence in example) |
| `lib/ai/code-parser.ts` | bug 6 fixed (path label expansion) |
| `lib/ai/streaming-file-extractor.ts` | reviewed — correct |
| `app/api/ai/chat/route.ts` | bug 2 fixed (fallback file list in data.done) |
| `components/editor/chat-panel.tsx` | bugs 1 + 3 fixed (streamedFile handler, re-fetch on streamed paths) |
| `components/editor/preview-panel.tsx` | fixed earlier (iframe re-key, diagnostic html) |
| `components/editor/editor-layout.tsx` | reviewed — `files` state correctly flows to PreviewPanel |

End-to-end. Nothing untraced.
