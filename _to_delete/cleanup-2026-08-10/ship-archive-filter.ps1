# Make `status` mean something: hide archived projects from the dashboard.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-archive-filter-result.txt"
"=== SHIP ARCHIVE FILTER $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- "migration/tanstack-start-app/src/lib/dashboard-server.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat(dashboard): hide archived projects, so `status` finally means something

21 test projects (hello-e2e-*, quality-test-*, sse-disconnect-test-*, parity-chat-*)
were cluttering the dashboard. Deleting them would have destroyed 155 project_files,
36 messages and 18 credit_logs - the last being an audit trail of actual credit
spend - so they are archived instead. Nothing is lost and it reverses with one
UPDATE.

BUT ARCHIVING ALONE WOULD HAVE DONE NOTHING. Every project in the database had
status 'active', and no query anywhere filtered on `status`. Setting 21 rows to
'archived' would have changed the dashboard not at all, while looking exactly like
a completed cleanup - the same "reports success, does nothing" defect this session
has spent its time removing. Checking that before acting is the only reason it was
caught.

So both list queries now exclude archived rows: the full project grid and the
8-item recent list on the dashboard home. The filter is what gives the status
meaning; without it the column is decoration.

Verified against the live database: 65 active / 21 archived, every one of the 21
matched and nothing else touched, and project_files, messages and credit_logs all
still present at their original counts.

Not done, deliberately: hard-deleting the 21. That destroys a financial audit trail
and is irreversible; the SQL is in the session notes if it is ever wanted. Archiving
achieves the actual goal - a clean dashboard - without that cost.
'@

$f = "D:\Projects\lifemarkai\.git\ARCH_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
