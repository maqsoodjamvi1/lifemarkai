$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase8-result.txt"
"=== BATCH 3 $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }
$s = "migration/tanstack-start-app/src"

git add -- `
  "$s/lib/ai/agent.ts" `
  "$s/lib/ai/http/agent.ts" `
  "$s/components/editor/chat-panel.tsx" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(agent): give the agent real context, an intent gate, and a feedback loop

Three gaps that made the agent both expensive and less capable than the chat path
it is supposed to be stronger than.

1. THE AGENT ONLY EVER SAW A LIST OF PATHS.
runAgent received the full file array but the opening user message rendered just
`files.map(f => "- " + f.path)`. So the model began every run blind and spent a
meaningful share of its 30-iteration budget calling read_file / search_code to
rediscover code the route had already loaded. On a large project that could
exhaust the loop before a single edit landed. Added AgentRunOptions.contextSeed
and injected it as an "Already-loaded file contents" section that explicitly tells
the model not to re-read what is shown and to use tools only for what is not. The
route fills it with buildProjectContext(files, 30000, task) - the same BM25-ranked,
per-file-budgeted selector the build path already uses, so it costs no extra model
call. Budget is deliberately below build's 80k: the agent still has tools for
anything omitted and its output cap is only 8k. Wrapped so context selection can
never block a run.

2. NO INTENT GATE. The chat route downgrades informational questions to chat mode
via isInformationalQuery, but this route accepted anything: "why is the cart
empty?" span up the full ReAct loop, read files and charged agent-tier credits to
answer a question that required no edits. Added the same gate, returning 409 with
suggestedMode: "chat" - well-formed request, just mis-routed. The client now
handles that 409 by switching mode and silently re-sending as chat, so the user
gets their answer instead of an error telling them to try again differently.

3. THE AGENT NEVER FED THE LEARNED-RULES FLYWHEEL. Verification failures become
'runtime' health findings, and learned-rules.ts needs >=2 hits per class before it
will inject a rule into future prompts. chat.ts recorded those findings; the agent
route did not - and the agent is the DEFAULT path for edits on mature projects
(editor-intelligence.ts shouldAutoBuildMode), so the flywheel was starved of its
main data source. Now records them too, best-effort, never failing a run.

Verified: both agent files and chat-panel parse via the TypeScript compiler API;
nine assertions cover the option being declared, destructured, injected and
labelled do-not-re-read, the route passing a ranked seed with buildProjectContext
actually imported (it was not, which would have been a runtime crash), the gate
present and returning a re-route hint, and the flywheel call in place. The client
re-send matches sendMessage's real signature (userMessage, overrideMode).
'@

$f = "D:\Projects\lifemarkai\.git\PHASE8_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
