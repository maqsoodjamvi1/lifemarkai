# Fix: the published-project check referenced a column that does not exist.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-deployed-url-fix-result.txt"
"=== SHIP deployed_url FIX $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- "migration/tanstack-start-app/src/routes/api/embed/error.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(telemetry): published check used a column that does not exist

/api/embed/error selected `deploy_url` from projects. That column is not there -
it is `deployed_url`. The select errored, `project` came back null, and the route
took its "not published" branch and returned 204.

204 is the SUCCESS response here, chosen deliberately so the endpoint cannot be
used to probe which project ids exist. That design decision turned this typo into
the worst kind of bug: every visitor error report was accepted, discarded, and
acknowledged as fine. The embed script would have reported nothing forever, the
panel would have shown an honest empty list, and there was no error anywhere to
suggest otherwise.

This is the third time this exact mistake has appeared in this project -
health_findings was written with `source`/`line_number` columns that do not exist,
and member_group_members was queried on `user_id` when it keys on `member_id`. In
all three cases the code type-checked, parsed, deployed, and did nothing. Assumed
column names are not caught by any static check; only the live schema settles it.

Caught by running a real end-to-end write against the production database rather
than trusting that the code "looked right" - the query failed on the very first
attempt with "column deploy_url does not exist".

Also adds a schema check that reads every column these routes reference straight
from information_schema and compares it to the live database. It now passes for
both files, and would have failed loudly on the original typo.
'@

$f = "D:\Projects\lifemarkai\.git\DEPURL_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
