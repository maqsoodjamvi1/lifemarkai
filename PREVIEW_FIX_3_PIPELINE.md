# Preview pipeline — deep fix

## What was broken

After tracing every step from user prompt to preview render, I found three
real bugs that were stacking to produce the blank preview:

### Bug 1 — Server emitted `streamedFile` events the client ignored

`app/api/ai/chat/route.ts` line 416 has a `StreamingFileExtractor` that
fires-and-forgets `project_files` upserts as soon as each file completes
in the JSON stream. After each upsert it emits an SSE event:

```ts
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ streamedFile: file.path })}\n\n`));
```

But `chat-panel.tsx`'s SSE handler had **no branch for `data.streamedFile`**.
The events were thrown away. Files written mid-stream were never tracked
in React state.

### Bug 2 — Final `data.files` event omitted streamed files when parseAIResponse came back empty

The server's `data.done` payload contained `files: parsedFiles` — the result
of `parseAIResponse(fullContent)`. If the AI's final JSON was malformed at
close (which happens with smaller models that emit prose+fence instead of
pure JSON), `parsedFiles = []`. But files HAD been written to DB by the
streaming extractor. Those files were lost from `data.files` at done time.

### Bug 3 — Client's `data.done` handler skipped re-fetch when `data.files` was empty

`chat-panel.tsx` line 1638 had:

```ts
if (data.files && data.files.length > 0) {
  // re-fetch project_files from DB, update editor-layout state
}
```

So when bug 2 happened (data.files empty even though files exist in DB),
the re-fetch was skipped. Editor-layout state stayed stale. PreviewPanel
got the old `files` prop. Preview rendered the placeholder.

## The three patches

### Server — `app/api/ai/chat/route.ts`

The `data.done` payload now reconstructs `files` from DB when
`parsedFiles.length === 0 && streamedFilePaths.size > 0`:

```ts
let finalFilesForClient = parsedFiles;
if (mode === "build" && parsedFiles.length === 0 && streamedFilePaths.size > 0) {
  const { data: dbFiles } = await supabase
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId)
    .in("path", Array.from(streamedFilePaths));
  if (dbFiles) finalFilesForClient = dbFiles;
}
```

### Client — `chat-panel.tsx`

Three changes:

1. New ref `serverStreamedPathsRef` (a `Set<string>`) initialised on each
   send. Tracks what the server has confirmed it wrote.
2. New SSE handler branch:
   ```ts
   if (typeof data.streamedFile === "string") {
     serverStreamedPathsRef.current.add(data.streamedFile);
   }
   ```
3. `data.done` re-fetches whenever `data.files` has entries OR the
   server streamed any paths during this turn. Falls back to reconstructing
   `diffSource` and `generatedFiles` from the streamed-paths set when
   `data.files` is undefined.

## Why this matters

Before these fixes, the user could:

- Click Build
- Watch files appear in the editor's Code tab (because the server's
  streaming extractor wrote them to DB and the editor-layout re-fetched
  on tab open)
- See the preview stay blank forever, because the editor's local React
  `files` state never updated even though DB had the new files

Now:

- Click Build
- Files stream into Code tab AND React state simultaneously
- Preview re-keys (from the previous fix) and renders the running app
- Diff card shows the file chips

## What this still doesn't fix

- A genuine AI failure (no files generated at all): preview correctly
  shows "Your preview will appear here". Working as intended.
- Babel compile errors inside the iframe: preview renders, but the user
  sees a white screen. Open DevTools and switch Console context to the
  iframe to see the error. Future work: forward iframe errors to a
  visible chat-panel banner.
- Path mismatches between what the AI named (`App.jsx`) and what
  `buildFallbackHtml` expects (anything ending in `.jsx`/`.tsx`): now
  shows the "No entry file found" diagnostic with the file paths it
  actually has. User can rename.

## Verification

```powershell
cd D:\Projects\lifemarkai
Remove-Item -Recurse -Force .next, .turbo -ErrorAction SilentlyContinue
npm run dev
```

Open a project, send a build prompt ("make a todo app with localStorage").
You should see:

- Each file appearing in the Code tab as it streams
- Chat shows a one-line summary after build completes
- File chips below the summary
- Preview iframe loads the running app within ~500ms of build completion

If the preview is still blank, the diagnostic HTML (from the previous
fix) tells you which condition failed. Paste it back and I'll diagnose
the specific remaining case.
