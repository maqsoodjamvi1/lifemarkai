$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-gapclose-result.txt"
"=== SHIP: close the Lovable intelligence gap $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
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

git add -- `
  "$s/lib/ai/package-allowlist.ts" `
  "$s/lib/ai/npm-auto-install.ts" `
  "$s/lib/ai/initiative-routing.ts" `
  "$s/lib/ai/code-parser.ts" `
  "$s/lib/ai/code-parser.test.ts" `
  "$s/lib/ai/system-prompts.ts" `
  "$s/lib/ai/prompts/auto-fix.ts" `
  "$s/lib/ai/http/chat.ts" `
  "$s/lib/ai/http/fix.ts" `
  "$s/routes/api/ai/fix.ts" `
  "$s/routes/api/editor-intelligence/initiative.ts" `
  "$s/routes/api/projects/`$id/sandbox-preview/sync.ts" `
  "$s/components/editor/chat-panel.tsx" `
  "$s/components/editor/editor-intelligence-panel.tsx" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat(ai): close the four gaps between our intelligence system and Lovable's

An audit compared the prompt and intelligence systems against Lovable. Prompting
was at or past parity - richer context assembly, BM25 plus a model-picked file
set, self-verify wired into the live chat and agent paths with a cross-model fix
chain. The intelligence system was ahead on paper and behind in delivery: the
strongest path never ran, and three prompt-to-runtime leaks corrupted real
projects. All four are closed here.

1. THE BEST GENERATION PATH NEVER RAN.
editor-lenses/orchestrator.ts (11 roles, debate protocol, CTO tie-break, wave
scheduler, real agent execution) had exactly two call sites, both under
/api/editor-intelligence, reachable only by opening a side panel. chat.ts said so
in a comment: the strongest path we have, and no normal build uses it. Lovable
does not win there on architecture - it wins because its one path is always on.

Builds are now risk-gated into it. decideInitiativeRouting() promotes a request
only when every guard holds: the feature is on (INITIATIVE_AUTOROUTE, default on),
the request clears a signal threshold STRICTER than the one needed to merely
suggest (INITIATIVE_AUTOROUTE_MIN_SIGNALS, default 3), the balance covers the
quoted ceiling, the caller declared it can run an initiative, and neither
forceBuild nor a plain-build phrase was used. Every decline records why in
declinedBecause.

The handoff is deliberate, not inline. The initiative route owns the orchestrator,
its credit reservation and its SSE contract; re-implementing that inside chat.ts
would have created a second copy of it - the same mistake as the two auto-fix
implementations. chat.ts emits initiative_routed and stops without charging;
chat-panel posts an in-thread explanation, opens the Intelligence panel and
re-dispatches the EXISTING lifemark-intelligence-run event, so there is still one
caller of runBuild and one owner of the stream. A caller that does not send
canRouteInitiative (API clients, older UI) keeps the normal build, because a
promoted request nobody executes is worse than a cheaper one that completes.

Found while wiring it: the route caps every run at 5 credits and 400s a larger
budgetCredits, while initiative-routing quoted 12-60. The quote overstated cost by
an order of magnitude and would have failed the request. INITIATIVE_MAX_CREDITS
now lives in initiative-routing and the route imports it, so the number quoted is
the number reserved.

2. THE PARSER INVENTED FILENAMES.
extractFencesAsFiles fell back to a counter: an unlabelled ```tsx fence became
src/file1.tsx, the next src/file2.tsx. Nothing imports those, so the user's actual
request went unfulfilled while the build reported success WITH files - junk in the
tree, an unchanged app, and no error to retry from. Unlabelled fences are now
counted and skipped, and the count reaches the retry prompt, which asks for the
one thing that was missing instead of saying "returned prose". Guessing a REAL
path instead would have been worse: that overwrites working code on a hunch. The
test that pinned src/file1.tsx as correct behaviour now pins the opposite.

3. THE PACKAGE ALLOWLIST WAS NEVER ENFORCED - AND CONTRADICTED ITSELF.
PACKAGE_ALLOWLIST was a markdown string no code consulted, while
syncPackageJsonDeps wrote every unrecognised import into dependencies as "latest"
from four call sites. A hallucinated name 404'd npm install before it installed
anything, so the user got a dead sandbox instead of a bad import; a name one
character off a real package installs whatever is on the registry. The prompt also
opened with "STRICT ALLOWLIST - never import anything else" and closed with "ANY
npm package may be added to package.json", and the models followed the closing
line. It was not merely unenforced, it was overruled in its own text.

lib/ai/package-allowlist.ts is now the single machine-readable source.
renderPackageAllowlistPrompt() generates the prompt section from it and
resolveAllowedPackage() gates installs from it, so the prompt cannot advertise
what the installer refuses. Versions are not invented: everything in the scaffold
inherits its pin from base-app-deps.ts, which also feeds the pre-baked Modal
image, so a pin matches what is really installed. Prefix rules cover
@radix-ui/react-* and @capacitor/*. Refused packages are reported, not swallowed -
silently dropping them would trade a broken install for a mystery unresolved
import. The auto-fix prompt's separate hand-written list, which named a different
set again, now renders from the same data.

4. THE MODEL'S DIAGNOSIS WAS THROWN AWAY.
AUTO_FIX_SYSTEM_PROMPT asks for `diagnosis` and `fix_description`. normalizeResponse
had neither field, so both were dropped and every repair surfaced as the
"Changes applied." default. The model had already worked out the root cause and we
discarded it - Lovable shows its reasoning on a fix. Both fields are carried
through ParsedAIResponse, buildFixExplanation() composes cause-then-change, and
both fix routes return it.

ALSO FIXED, uncovered by the type-check: system-prompts.ts used
`export { AUTO_FIX_SYSTEM_PROMPT } from ...`, which re-exports WITHOUT creating a
local binding, then interpolated it as a value in buildRepairPrompt(). That is a
ReferenceError on the exact path chat.ts takes when validation fails and it calls
the escalation model to repair a build - the auto-fix escalation was broken at
runtime. Now imported, then re-exported.

Verified with 82 assertions against the real functions plus 9 runtime prompt-
assembly checks: hallucinated names refused and absent from package.json, allowed
ones pinned rather than "latest", nothing named in the prompt that the installer
rejects, no "latest" written anywhere, unlabelled fences yielding zero files and
never a src/fileN path, labelled fences still salvaged, diagnosis reaching the
explanation with no fabricated Cause line when absent, big multi-part asks routing
while trivial edits never do, each routing guard failing independently with its
reason, quotes never exceeding the route's hard cap, buildRepairPrompt no longer
throwing. The earlier 47-assertion file_update suite and the project's own 27
code-parser tests are still green, and every changed module type-checks clean.
'@

$f = "D:\Projects\lifemarkai\.git\GAPCLOSE_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
git status --porcelain 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
