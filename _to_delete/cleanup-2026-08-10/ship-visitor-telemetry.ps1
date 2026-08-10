# Ship visitor error telemetry for published apps (gap #15 / task #218).
#
# Adds migration 158. Ships the CODE only - the migration still has to be applied
# to live Supabase before the endpoint can write anything. Until then the route
# fails silently by design (its rpc call is wrapped) rather than 500ing at visitors.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-visitor-telemetry-result.txt"
"=== SHIP VISITOR TELEMETRY $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

$s = "migration/tanstack-start-app/src"
git add -- `
  "supabase/migrations/158_app_error_events.sql" `
  "$s/routes/api/embed/error.ts" `
  "public/embed/errors.js" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat(telemetry): visitor error reporting for published apps

Published apps had no error visibility whatsoever. preview_telemetry (094) only
covers the EDITOR preview, where the owner's own browser is the writer. The moment
an app is published, real visitors hit real bugs and nobody ever finds out - the
owner's only signal is a customer complaining, or silence.

Three pieces: migration 158, a public ingest endpoint, and an embed script.

WHY AGGREGATED RATHER THAN APPENDED. One row per (project, fingerprint) with a
counter, not one row per occurrence. A single broken render loop fires thousands of
errors a second; appending would let one visitor write unbounded rows into a table
nobody is watching. Aggregation turns that into an UPDATE of one counter - cheaper,
and a natural abuse ceiling rather than a bolted-on one.

THIS IS THE MOST EXPOSED WRITE PATH IN THE PRODUCT. It must be public and
unauthenticated, because visitors of a published app have no session with us. Every
guard is therefore load-bearing:

  - The project must exist AND be published (deploy_url set). Otherwise anyone
    could write rows against any project id they can guess.
  - An unknown project gets the SAME 204 as success, so the endpoint cannot be used
    to enumerate which project ids exist.
  - The SERVER computes the fingerprint (sha256 of message + top stack frame). A
    client-supplied grouping key would let one visitor forge unlimited distinct
    groups, or collide two unrelated bugs into one.
  - Rate limited per project, so a broken app cannot flood us and one noisy app
    cannot consume another's budget.
  - record_app_error caps distinct groups at 200/project. Occurrences of a KNOWN
    error are just an increment and effectively unlimited; it is NEW groups that
    are capped, which is precisely the randomised-message attack.
  - Writes are service-role only. RLS grants anon no INSERT at all; SECURITY
    DEFINER with a fixed search_path so a public endpoint cannot be hijacked
    through a mutable one.

NO PII, ENFORCED BY SHAPE. There is no column for user id, email, IP, cookies or
full URL. Query strings are stripped in the browser AND again on the server, and
the user agent is reduced to a coarse bucket ("Chrome"/"Safari"/"other") rather
than stored raw, since a full UA string is a fingerprinting vector. Not having the
column is a stronger guarantee than remembering to scrub the value: a future
contributor cannot accidentally populate a field that does not exist.

The embed script runs inside somebody else's app, so it follows the same rules the
rest of this codebase uses for injected code: never break the host (everything
wrapped), never swallow (passive listeners, no preventDefault, the app's own error
handling and the console are untouched), never spam (in-page dedupe plus a hard cap
of 10 beacons per page load - the cheapest request is the one never sent), and
sendBeacon so navigation-time errors survive unload.

Verified with 22 assertions, including the script executed against a simulated
browser: a URL carrying ?token=SECRET yields path "/cart" and the token appears
nowhere in the payload; a duplicate error sends one beacon, not two; 30 distinct
errors send exactly 10; caps truncate at 500/2000/300 to match the CHECK
constraints; Edge is not misreported as Chrome; an unknown UA does not leak its
string.

NOT DONE YET: migration 158 must be applied to live Supabase. Until then the rpc
call fails and is swallowed - visitors see nothing, which is the correct failure
mode for telemetry, but no errors are recorded either. There is also no UI for the
collected errors yet; that is the obvious follow-up.
'@

$f = "D:\Projects\lifemarkai\.git\TELEMETRY_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
