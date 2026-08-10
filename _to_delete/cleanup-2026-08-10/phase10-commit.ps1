$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase10-result.txt"
"=== BATCH 4 $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }
$s = "migration/tanstack-start-app/src"

git add -- "$s/lib/ai/initiative-routing.ts" "$s/lib/ai/http/chat.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat(ai): connect the 11-role orchestrator to normal builds - as an offer, not an auto-route

editor-lenses/orchestrator.ts (discovery -> planning -> debate -> waves ->
verification across 11 roles, with checkpoints, autonomy gates and a credit
budget) is the strongest generation path in the codebase, and it was reachable
ONLY from the Editor Intelligence side panel. No normal build has ever used it.

I deliberately did NOT auto-route builds into it. An initiative spans multiple
waves of role calls; a build is one generation plus at most a repair pass.
Silently promoting one to the other could multiply a user's credit spend on a
single message - and "expensive, invisible, heuristic-triggered" is exactly the
failure mode this codebase has already been bitten by twice this week (a
fabricated MCP context block degrading every build, and an entry check that forced
an escalation-model repair pass on every TanStack build). The decision to spend
belongs to the user.

So: lib/ai/initiative-routing.ts recommends. recommendInitiative() requires at
least TWO independent signals before it will even suggest - explicit requirement
lists of 3+, multi-feature language, 2+ distinct subsystems, phased/milestone
wording, or a very long spec - and only for build/agent mode on prompts over 180
chars. It returns the reason, which signals fired (so the heuristic can be tuned
against real usage), and a credit ceiling that is bounded at 60 so the offer is
never open-ended.

chat.ts emits it as an `initiative_suggestion` SSE event alongside build_intent.
The build proceeds normally regardless; the event only tells the client the team
COULD have been used. Wrapped in try/catch - a suggestion must never disturb a
build.

Gated by ENABLE_INITIATIVE_SUGGESTIONS, DEFAULT OFF. With no env configuration
this emits nothing and behaviour is byte-identical to before.

Verified with 11 assertions: a short tweak, a long single-page prose request, a
patch-mode request and a one-signal request are all correctly NOT recommended (the
cheap path stays default); a phased multi-epic e-commerce spec IS recommended with
3 signals and a 32-credit quote; the budget stays within 12..60; the reason states
the cost tradeoff; and the flag is off with no env and on when set to 1.

NOT DONE, and needed before this is user-visible: the chat panel has no card for
the initiative_suggestion event yet. With the flag off that is not a half-wired
state - nothing is emitted - but turning the flag on without the card would emit
an event nothing renders.
'@

$f = "D:\Projects\lifemarkai\.git\PHASE10_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
