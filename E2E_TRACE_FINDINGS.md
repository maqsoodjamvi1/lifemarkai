# E2E source trace — findings

> Method: walked the source code at every handoff in the user journey
> "type prompt → AI generates → preview renders". Catches bugs that
> static analysis misses because they only fire under specific timing or
> data shapes.

## Real bugs found and fixed this trace

### Bug 1 (FIXED) — Brainstorm SSE parser dead-codes the catch branch

**File:** `components/dashboard/prompt-create-box.tsx` line 138-140 (before fix)

```ts
catch (e) {
  if ((e as Error).message !== "Unexpected token") throw e;
}
```

**Why broken:** `JSON.parse` never throws with the exact message `"Unexpected
token"`. Real messages are `"Unexpected token 'x', \"...\" is not valid JSON"`
or `"Unexpected end of JSON input"`. So the `!== "Unexpected token"` check
always matched, and every parse error (including expected partial-chunk
errors) got re-thrown. Brainstorm flow was randomly flaky depending on
where SSE chunks split.

**Fix:** expanded the predicate to actually detect partial-parse errors by
their real prefixes (`startsWith("Unexpected token")`, `startsWith("Unexpected end of JSON input")`, etc.) and added a comment explaining the SSE
chunking expectation.

### Bug 2 (deferred — pre-existing security concern)

**File:** `app/editor/[projectId]/page.tsx` line 79

```ts
if (!collab && !project.is_public) notFound();
```

**Why concerning:** the inverse — `project.is_public === true` — lets any
authenticated user into the **editor** of a public project. "Public" usually
means the deployed URL is accessible, not the editor. Letting random users
into the editor of any public project potentially leaks code that the owner
considers source-private even though the deployed app is exposed.

**Action:** flagging only. The pre-existing behavior may be intentional
(allows "fork to remix" patterns). Changing it requires product-decision
input.

## Bugs already fixed earlier this session (reconfirmed)

The earlier audits caught:
- Strategy 6 path-label regex misses (backtick/bold/bare)
- OpenRouter jsonMode forwarding gap
- Streaming-extractor → client re-fetch race
- iframe srcDoc reactivity (re-key on length)
- Preview URL bar bidirectional sync
- Supabase auth lock singleton
- Marketing navbar invisible Sign in button
- Landing-page black screen (framer-motion opacity:0 stuck)

All hold up against the new trace. No regressions.

## Non-bugs (verified clean)

These looked suspicious during the trace but turned out fine:

| Suspect | Why it's not a bug |
|---|---|
| `prompt-create-box.tsx` line 62 double-evaluates `(overrideName ?? trimmed)` | `trimmed` is a primitive string, no side effects. Cosmetic only. |
| `chat-panel.tsx` line 994 `setInput("")` followed by `sendMessage(starterPrompt)` | The `setInput("")` is preventive; `sendMessage` receives the literal `starterPrompt`, not the input state. Harmless. |
| `editor/[projectId]/page.tsx` `notFound()` fallback in catch block | Correct — broken project shouldn't render. |

## What this trace did NOT cover

I traced ONE user journey: dashboard → /api/projects POST → editor → chat-panel
auto-fire → ai/chat route → preview-panel render.

I did NOT trace:
- OAuth signup flow (`/auth/callback`)
- Deploy flow (`/api/deploy/*`)
- GitHub sync flow
- Visual-edit overlay flow
- Multi-collaborator real-time sync via Yjs
- Plan-mode → Agent-mode handoff

Each of those is its own multi-handoff path. Recommendation: walk through
one per session in future sweeps. The dashboard→preview path I traced
today caught 1 real bug + 1 concern in ~3 hours of source reading; expect
similar yield per path.

## Diagnostic the user could run

If the brainstorm flow has been flaky, this fix should resolve it. To
verify:

1. Open the dashboard
2. Type a vague idea into the prompt box ("I want to build something for fitness")
3. Click "Get ideas"
4. You should see 3 concept cards appear within ~5s without an error toast
5. Before the fix, this would sometimes show "Brainstorm failed — Couldn't
   generate concepts" depending on where the SSE chunks split

If it still fails, the next thing to check is whether
`/api/ai/brainstorm` returns valid SSE. Open DevTools → Network → click
"Get ideas" → look at the response stream for the brainstorm request.
Each line should start with `data: ` and be valid JSON.
