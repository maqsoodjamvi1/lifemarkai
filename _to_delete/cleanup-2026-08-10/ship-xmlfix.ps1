$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-xmlfix-result.txt"
"=== SHIP: truthfulness fixes + file_update XML mismatch $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"

if (Test-Path "D:\Projects\lifemarkai\.git\index.lock") {
  Log "removing stale index.lock"
  Remove-Item "D:\Projects\lifemarkai\.git\index.lock" -Force -ErrorAction SilentlyContinue
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }

$s = "migration/tanstack-start-app/src"

# ---------------------------------------------------------------- commit 1
git add -- "$s/lib/ai/agent.ts" "$s/lib/ai/http/agent.ts" "$s/lib/ai/patch-applier.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg1 = @'
fix(ai): stop reporting success for work that did not happen

Two bugs where the system told the user something had happened when it had not.
Both are worse than a visible failure, because there is nothing to retry.

1. delete_file DELETED NOTHING.
agent.ts removed the path from its in-memory fileMap and returned
"Deleted: <path>". The agent route persists exclusively via upsert, so no code
path ever issued a DELETE against project_files. The agent said the file was
gone, its summary said so, and the file was still in the project and still in the
preview - then reappeared in context on the next turn, so the agent could
"delete" the same file repeatedly. Added AgentRunOptions.onFileDelete, threaded
through buildTools, and wired the route to remove the row and emit a fileDeleted
event. When no hook is supplied the tool now says the deletion is not persisted
and instructs the model not to report it as deleted, rather than claiming success.
Also returns "File not found" when the path is not in the working set, instead of
reporting a successful delete of something that never existed.

2. THE PATCH APPLIER EDITED AN ARBITRARY OCCURRENCE.
PATCH_SYSTEM_PROMPT tells the model `find` must be copied verbatim with 3-5
surrounding lines "so it is unique". Nothing enforced it: the applier ran
current.replace(patch.find, ...), which edits the FIRST match. A find string
matching several sites patched an arbitrary one and returned applied: true, so
chat.ts recorded patchOutcome "applied" and the user was told it worked - the
wrong-location half of the "patches miss" class, and invisible precisely because
it reports success. Now rejects ambiguous matches, for both the exact and the
whitespace-flexible path (the latter matters more, since its raw-index mapping is
documented in-file as approximate). agent.ts edit_file and xml-stream-parser
already rejected ambiguity; this applier was the odd one out of three. Failing is
safe: chat.ts treats an unapplied patch as a miss and falls back to a full build.

Verified against the real applyPatches: an ambiguous find is rejected with an
explanatory error and the file is left byte-identical; a unique find still
applies; a genuine miss is still reported as not found. All three touched files
parse via the TypeScript compiler API.
'@

$f1 = "D:\Projects\lifemarkai\.git\SHIP_MSG1.txt"
[System.IO.File]::WriteAllText($f1, $msg1, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f1 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f1 -Force -ErrorAction SilentlyContinue

# ---------------------------------------------------------------- commit 2
git add -- "$s/lib/ai/code-parser.ts" "$s/lib/ai/code-parser.test.ts" "$s/lib/ai/xml-stream-parser.ts" "$s/lib/ai/http/chat.ts" "$s/lib/ai/http/fix.ts" "$s/routes/api/ai/fix.ts" "$s/lib/preview/preview-error-bridge.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg2 = @'
fix(ai): server now understands the <file_update> XML it asked models for

The preview self-heal prompt told the model: "Use <file_update> with <search> and
<replace> when possible." Two consumers read that response and only one
understood the format.

THE CLIENT DID. chat-panel one-click-sends the healing prompt as a BUILD message
and feeds the SSE stream to XmlStreamParser, which applies <full> and
<search>/<replace> blocks to its local file state - so the editor showed the fix
and the preview reflected it.

THE SERVER DID NOT. parseAIResponse had no XML strategy at all (grep file_update
in code-parser.ts returned nothing). A compliant response fell through every JSON
strategy to the prose-fence salvage, produced zero files, persisted nothing, and
tripped the "model returned prose" retry - a paid round trip whose visible result
was correct and whose stored result was unchanged. Reload and the fix was gone.
The /api/ai/fix route was worse: parseFixResponse threw "AI response missing
files array", so a search/replace answer was a hard failure on a credited action.

Reachable, not theoretical: jsonMode sets response_format json_object only on
OpenAI-compatible providers. provider.ts records that Anthropic has no such
parameter and relies on the system prompt - and the repair path calls
ESCALATION_MODEL (Anthropic) directly, so nothing forced JSON there.

Fixed on both sides of the contract.

PROMPT. buildHealingPrompt no longer names a wire format. It could not know one:
chat-panel sends it as "build" (JSON object of complete files) and the chat route
may auto-route it to "patch" (JSON patch array) - encouraged by the word
"surgical" in this very prompt. Format belongs to the mode's system prompt, which
is the only thing that knows the mode. The prompt now states the task only. Its
first line is unchanged and documented as load-bearing: chat-panel one-click-sends
only when the text startsWith "Fix the preview/runtime errors".

PARSER. xml-stream-parser gains parseFileUpdateBlocks(raw), a non-streaming
counterpart that shares nextFileUpdateBlock and parseFileUpdateBlock with the
streaming class - one implementation of block boundaries, entity decoding, body
trimming and path normalisation, so client and server cannot drift. code-parser
delegates to it rather than carrying a second regex set (the first draft of this
fix did, and would have differed on entities and leading slashes).

CODE-PARSER. New strategy for <file_update>, ordered ahead of prose-fence salvage:
an explicit path attribute beats guessing a path from a nearby comment. <full>
blocks become files directly. <search>/<replace> cannot be resolved there -
parseAIResponse only receives raw text - so they are returned as
ParsedAIResponse.xmlPatches for a caller that holds the files.

CALLERS. Every live consumer runs xmlPatches through applyPatches, against
existing files overlaid with any <full> blocks from the same response so both
kinds compose on one path, then merges results by path. Unapplied patches are
logged and left to the existing zero-files retry; applyPatches already rejects
ambiguous matches, so a vague search block fails loudly instead of editing the
wrong line.

There are two auto-fix implementations and the live one is easy to miss: routes/
api/ai/fix.ts defines POST inline (createFileRoute) while lib/ai/http/fix.ts is
reached only through the AI worker (run-ai-http). Chat and agent DO go through
that worker, so lib/ai/http/chat.ts is live. Both fix copies are patched, so the
behaviour does not depend on which one a future change routes to.

Also renamed a stale reference: code-parser.test.ts described itself as testing
"Strategy 6" fence extraction, which the new strategy pushed to 7. It now names
extractFencesAsFiles instead of a number, so renumbering cannot make that comment
lie again.

Verified with 47 assertions against the real functions: <full> yields files;
search/replace yields patches that apply and leave the rest of the file
byte-identical; the streaming client and the server produce byte-identical content
for one block fed 7 characters at a time; entities decoded and leading slash
stripped identically; malformed blocks skipped rather than guessed; JSON, JSON
fence, prose fence and plain chat paths unchanged; JSON that merely mentions the
tag still parses as JSON; the healing prompt keeps its load-bearing first line and
names no format. All five files parse via the TypeScript compiler API.
'@

$f2 = "D:\Projects\lifemarkai\.git\SHIP_MSG2.txt"
[System.IO.File]::WriteAllText($f2, $msg2, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f2 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f2 -Force -ErrorAction SilentlyContinue

# ---------------------------------------------------------------- push
git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -4 2>&1 | Out-File $log -Append -Encoding ascii
git status --porcelain 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
