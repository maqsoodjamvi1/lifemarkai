# Dockerfile: accept VITE_SENTRY_DSN as a build ARG.
#
# WHY THIS IS A SEPARATE, NECESSARY COMMIT: Vite INLINES VITE_ vars at BUILD time.
# Setting SENTRY_DSN as a runtime env var in Coolify would start server-side
# reporting and leave the browser reporting nothing - and it would look like the
# reporter was broken rather than unconfigured. The value has to be present during
# `vite build`, which means a build ARG.
#
# A DSN is not a secret: it is an ingest endpoint, public by design, and ships
# inside every client-side Sentry bundle on the web. Baking it into the image is
# the intended usage, unlike the API keys the Dockerfile warns about.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-sentry-dockerfile-result.txt"
"=== SHIP SENTRY DOCKERFILE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

git add -- "Dockerfile" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
build: accept VITE_SENTRY_DSN as a build ARG so browser errors report

Completes the Sentry re-wire. Without this, setting SENTRY_DSN in Coolify would
have covered only the server: Vite inlines VITE_ prefixed vars at BUILD time, so a
value that exists only at runtime never reaches the client bundle. The browser
would have reported nothing while the dashboard showed server events - which reads
as a broken reporter rather than a missing build arg, and would have cost an hour
to diagnose.

Adds ARG/ENV for VITE_SENTRY_DSN (client) and SENTRY_RELEASE (optional, groups
errors by deploy). SENTRY_DSN itself needs no ARG - the server reads it from the
runtime environment.

Baking the DSN into the image is correct here, despite the SecretsUsedInArgOrEnv
warnings this Dockerfile already emits for real credentials. A DSN is an ingest
endpoint, public by design: every client-side Sentry bundle on the web contains
one. It identifies where to send events, and grants nothing.
'@

$f = "D:\Projects\lifemarkai\.git\SENTRYDOCKER_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
