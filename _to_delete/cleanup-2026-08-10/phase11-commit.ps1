$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase11-result.txt"
"=== TRUTHFULNESS FIXES $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }
$s = "migration/tanstack-start-app/src"

git add -- "$s/lib/ai/agent.ts" "$s/lib/ai/http/agent.ts" "$s/lib/ai/patch-applier.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
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

$f = "D:\Projects\lifemarkai\.git\PHASE11_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
