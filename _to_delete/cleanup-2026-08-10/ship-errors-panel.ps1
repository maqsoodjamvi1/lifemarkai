# Ship the visitor-errors UI: read/triage route + editor panel.
#
# Closes the gap called out in the previous commit's own message - telemetry was
# collecting into a table with no way to see it, which is a feature that exists
# only on paper.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-errors-panel-result.txt"
"=== SHIP ERRORS PANEL $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

$s = "migration/tanstack-start-app/src"
git add -- `
  "$s/routes/api/projects/`$id/app-errors.ts" `
  "$s/components/editor/app-errors-panel.tsx" `
  "$s/components/editor/lazy-editor-panels.tsx" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat(telemetry): surface visitor errors in the editor

The previous commit collected visitor errors into app_error_events and admitted in
its own message that there was no way to look at them. Data accumulating where only
a direct SQL query can reach it is a feature on paper only, so this adds the read
path and the panel.

/api/projects/:id/app-errors deliberately uses the REQUEST-SCOPED Supabase client,
not the admin client. RLS on app_error_events already encodes exactly who may read
a project's errors - owner, or accepted collaborator. Re-checking that here would
be a second copy of an access rule, and second copies drift: that is precisely how
`member_group_members` ended up keyed on the wrong column earlier in this project
and silently denied every group-based grant. Letting RLS decide means an
unauthorised caller sees an empty list rather than a leak.

PATCH toggles resolved, DELETE removes a group. Both scope by project_id in
addition to the row id, so a valid error id from one project cannot be used against
another even if RLS were ever loosened.

The panel is deliberately NOT merged into ProblemsPanel. Those are compile-time
markers from the editor's own Monaco instance - things the developer can see for
themselves. These are runtime failures real visitors hit in production, which the
owner otherwise learns about only from a complaint. Same word, opposite audience;
merging them would bury the second in the first.

Two presentation choices that are the point rather than decoration:

- OCCURRENCES ARE AS PROMINENT AS THE MESSAGE, and colour-coded past 10 and 100.
  One error seen 900 times is a different emergency from one seen twice, and a
  flat list treats them identically.
- "NO ERRORS" AND "COULD NOT LOAD" RENDER DIFFERENTLY. An empty list is exactly
  what a broken fetch looks like, and a monitoring panel that shows silence when
  it actually failed is the same class of lie as the synthetic Cloud health metrics
  removed earlier in this project.

Verified with 14 assertions: all three files parse; the panel is imported and
routed without colliding with the existing "problems" key; every handler checks
auth; GET, PATCH and DELETE each scope to the project id; resolved rows are hidden
unless requested; the load-failure state is distinct from the empty state.

One of those assertions initially failed by counting `.eq("project_id")`
occurrences across the file and expecting 2 - GET scopes by project too, so the
count was 3 and the code was right. Rewritten to check each handler's body
individually, because a total says nothing about WHICH handler is protected.

Still pending: migration 158 on live Supabase. Until then this panel correctly
shows a load error rather than a comforting empty list.
'@

$f = "D:\Projects\lifemarkai\.git\ERRPANEL_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
