# Step 1 of the access-model consolidation: stop visibility and is_public drifting.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-visibility-sync-result.txt"
"=== SHIP VISIBILITY SYNC $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- `
  "migration/tanstack-start-app/src/lib/server-fns/projects.ts" `
  "docs/access-model-consolidation.md" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(access): keep visibility and is_public from drifting apart

Two columns answer "who can see this app" and only one is enforced. The RLS
policies on projects gate on `is_public`; nothing reads `visibility` at the
database level. The publish panel writes only `visibility`.

The result, measured on the live database: 25 projects with visibility='public'
and is_public=false. Postgres hid every one of them from anonymous visitors, so
/app/:slug returned 404 while the owner believed the app was published. Four real
projects were backfilled by hand; 21 were test artifacts and were left alone.

This makes the invariant `is_public === (visibility === "public")` hold for every
write that goes through updateProject - the one place both fields are settable.

`visibility` is authoritative: it carries three states and is what the UI actually
sets. When only `is_public` is supplied it is mapped back, and false maps to
"private" rather than "workspace" - false is a request to STOP being publicly
visible, and the conservative reading is the correct one for access control. Fail
closed, not "slightly less open".

A CORRECTION TO MY OWN EARLIER ANALYSIS, since it changed the fix.
I claimed PATCH /api/projects/:id "forwards the entire request body with no field
allowlist", and used that to argue a sync fix would be unsafe. That was wrong.
updateProject has PROJECT_UPDATE_FIELDS, rejects unknown keys outright, and lists
BOTH visibility and is_public in OWNER_ONLY_PROJECT_FIELDS. The write path was
properly gated all along; I had not read it before describing it.

That correction is what makes this fix safe: because both fields were already
owner-only, deriving one from the other adds no new authority. It only stops an
owner reaching a state that cannot be expressed coherently. docs/
access-model-consolidation.md has been amended with the same correction, since it
sits in a document about access control and being wrong there is worse than being
wrong in a commit message.

THIS IS A STOPGAP, and says so in the code. The real fix is collapsing visibility,
is_public and publish_audience into one model - three fields for one concept is the
root cause. The staged plan is in docs/access-model-consolidation.md; it is a
security-boundary change and wants doing deliberately, not appended to a long
session.

Verified with 16 assertions against the extracted logic: publish-panel writes,
each of the three visibility values, legacy is_public-only writes in both
directions, and a contradictory patch where visibility must win. The invariant is
asserted separately on every case, and an unrelated patch (a rename) is confirmed
to have no visibility or is_public injected into it.

Three of those assertions initially failed against correct code - two compared
JSON.stringify output whose key ORDER differed while the content matched, and one
checked source position with a whitespace-sensitive literal. Comparing serialised
objects for equality is a bad habit that manufactures failures; they now compare
field by field.
'@

$f = "D:\Projects\lifemarkai\.git\VISSYNC_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
