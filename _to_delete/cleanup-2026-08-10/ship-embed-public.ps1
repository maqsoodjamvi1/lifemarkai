# The three embed scripts were 404ing. Serve them from the app that runs.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-embed-public-result.txt"
"=== SHIP EMBED PUBLIC $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- "migration/tanstack-start-app/public" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(embed): serve the embed scripts - all three were 404

/embed/errors.js, /embed/paywall.js and /embed/comments.js all returned 404 in
production. Verified by fetching them.

Cause: they live in the REPO ROOT public/, which Next.js served. The app that
actually runs is migration/tanstack-start-app, and that directory had no public/
at all - it was never created during the migration. Vite serves ./public at the
site root by default and there is no publicDir override, so nothing under the
root public/ has been reachable since the cutover.

What was silently switched off:

  paywall.js  - the in-app paywall overlay for monetised published apps. The
                /api/embed/checkout and /api/embed/status endpoints are alive,
                but the script that renders the gate never loaded, so a paid app
                showed its content to everyone.
  errors.js   - the visitor error beacon added earlier TODAY. The ingest route
                answers (400 on a malformed body, so it is up), but no published
                app could ever load the script that posts to it. The feature
                reported healthy end to end while collecting nothing.
  comments.js - same fate.

Copied into migration/tanstack-start-app/public/embed/. The Dockerfile's COPY . .
already carries the directory, and `vite build` emits public/ into the output, so
no build change is needed.

This is a migration-leftover class of bug worth remembering: an asset that stops
being served produces no error anywhere. The route serving it does not 404 in any
log you read, the feature's own API keeps returning 200 to health checks, and the
only symptom is a capability quietly doing nothing. Found by probing the static
paths directly rather than the API endpoints behind them - the endpoints all
looked fine.

Not yet verified live: this needs a deploy, then GET /embed/errors.js should be
200 with `text/javascript`. Until that build runs I have only established the
files are in the right directory.
'@

$f = "D:\Projects\lifemarkai\.git\EMBED_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
