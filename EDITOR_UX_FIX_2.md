# Editor UX fix 2 — Lovable-style build summary in chat

## What this changes

Compare your screenshot to the TIME Soft Solution example — Lovable's
assistant messages for builds read like:

> Your TIME Soft Solution website is live with a dark navy hero, electric
> blue accents, smooth scroll animations, and sections for Services,
> About, Why Us, and Contact — all built on a clean design system.

Not like a wall of code blocks. The user never sees `import React from 'react'`
in chat — that goes to the Code tab.

This patch makes LifemarkAI's build-mode assistant messages render the same
way. When a build/agent/patch turn produces files, the chat panel shows ONLY
a one-line summary, and the detailed diff card with clickable file chips
still renders below it. Code is one click away (Code tab or chip click),
not in the user's face.

## What I changed

`components/editor/chat-panel.tsx` around line 2502:

- When `msg.mode === "build" | "agent" | "patch"` AND `messageDiffs[msg.id]`
  has entries (i.e. files were actually produced):
  - Skip `<MessageContent>` (the full markdown render of the AI's prose +
    code blocks).
  - Render a single `<p>` with the first sentence of `msg.content`, stripped
    of markdown emphasis and capped at 220 chars.
- When `msg.content` starts with a code fence or `{` (the model jumped
  straight to code with no preamble), show a generic line:
  "Updated N files. Open the Code tab or preview to see the result."
- Everything else (chat mode, plan mode, agent without files, etc.) still
  renders via `MessageContent` exactly like before.

## What this does NOT change

- The existing **commit-title card with file chips** at line 2511 below the
  message. It still renders. Clicking a chip still opens that file in the
  Code tab. Diff view still works.
- The **revert / undo / regenerate** controls. They still operate on the
  message via `messageDiffs[msg.id]`.
- **Chat mode** responses. Investigations, Q&A, suggestions, etc. all keep
  rendering as markdown prose with code blocks. Only build-class modes are
  changed.
- The **streaming display**. The progress chips and file-streaming preview
  still appear during generation. The summary only applies to the *finished*
  message.

## Why this fix is small

The existing chat panel already extracted the right data structures —
`messageDiffs` with paths/old/new content per file. The previous code just
rendered the full assistant content INSTEAD OF / AS WELL AS the diff card.
The patch is conditional rendering: if a build summary is appropriate, show
that; otherwise fall back to the existing behavior.

## Apply

The patch is in place in your working tree. Restart the dev server (or rely
on Fast Refresh) and try a build prompt. You should see:

- Chat: one-line summary, file chips below
- Code tab: the actual generated files
- Preview: the running app (assuming `parseAIResponse` parsed the files,
  which now has the Strategy 6 fence-extraction rescue from the previous
  patch)

## What's still on the list

From the four-gap analysis I gave you:

| Gap | Status |
|---|---|
| Build-mode chat: hide code, show summary | DONE this patch |
| Build-step indicators ("Pushed from GitHub", etc.) | Not yet — ~1 day of work |
| Preview rendering issue when files exist | Strategy 6 in code-parser.ts should fix the most common cause; if files exist but preview is still blank, open the iframe console and look for Babel compile errors |
| Investigate-mode separation | Not yet — half-day fix to route "please investigate" / "what would happen if" prompts to chat mode regardless of the toggle |

If you want me to pick one of those three next, say the word.
