# Archiving was a one-way door in the UI. Make it a toggle.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-archive-restore-result.txt"
"=== SHIP ARCHIVE RESTORE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- "migration/tanstack-start-app/src/components/editor/project-settings-panel.tsx" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(settings): archiving was a one-way door - add Restore

The Danger Zone's Archive button always wrote status='archived'. Nothing in the
entire UI ever wrote it back. Once archived, the only way to recover a project
was a hand-written UPDATE against the database - for an action whose own help
text promised it merely hides the project and "keeps all data".

The button now reads the project's actual status and toggles, with copy that
matches whichever state you are in.

The section banner also claimed "These actions are irreversible" over a card
containing the one reversible action in the panel, which made archiving read as
dangerous as deletion. It now says what is actually true: deletion is permanent,
archiving is not.

A CORRECTION TO WHAT I SAID IN THE PREVIOUS COMMIT.
I claimed no query anywhere filtered on `status`, and used that to argue that
archiving would be a no-op. I had grepped two server files and generalised from
them. ProjectsGrid has filtered `p.status !== "archived"` client-side all along,
so the dashboard grid would have hidden them correctly on its own. My statement
was drawn from an incomplete search and stated with more confidence than it had
earned.

What was genuinely unfiltered: the sidebar recent-projects rail, which renders
its rows directly with no status check, and the Templates tab's project count.
The server-side filter in the previous commit fixes those two and avoids sending
21 rows and their file counts to the browser to be discarded - but it was not,
as I said, the thing that made archiving work.

Deliberately NOT filtered: /dashboard/projects ("All Projects"), which already
prints each project's status on the card. It is the only surface where an
archived project stays visible, which is what makes this Restore button
reachable. Filtering it too would have hidden archived projects everywhere and
turned archiving back into the one-way door this commit removes.

Verified against the live database: for the account that owns the 21 test
projects, the dashboard and sidebar now return 57 and All Projects returns 78,
a difference of exactly the 21 archived rows.
'@

$f = "D:\Projects\lifemarkai\.git\ARCHRES_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
