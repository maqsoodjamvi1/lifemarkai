# Ship the Sentry re-wire.
#
# Includes a lockfile change (root), so the integrity gate from fix-lock.ps1 is
# repeated here: byte count, node-parsed JSON, and the specific entries that must
# be present/absent. A lockfile that disagrees with package.json is what broke the
# build once already today.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-sentry-result.txt"
"=== SHIP SENTRY $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

# --- lockfile integrity (node, NOT ConvertFrom-Json: PS cannot handle the ""
# --- root-package key a lockfile always has) -------------------------------
$lock = "D:\Projects\lifemarkai\package-lock.json"
$EXPECTED = 709119
$len = (Get-Item $lock).Length
Log ("lock bytes = " + $len + " (expected " + $EXPECTED + ")")
if ($len -ne $EXPECTED) { Log "SIZE MISMATCH - not committing."; Log "DONE"; exit 1 }

$json = & node -e "try{JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('OK')}catch(e){console.log('FAIL '+e.message)}" $lock 2>&1
Log ("lock JSON  = " + $json)
if ("$json" -notmatch "^OK") { Log "NOT committing a corrupt lockfile."; Log "DONE"; exit 1 }

$hasNextjs = Select-String -Path $lock -SimpleMatch 'node_modules/@sentry/nextjs' -Quiet
$hasPostcss = Select-String -Path $lock -SimpleMatch 'node_modules/next/node_modules/postcss' -Quiet
Log ("@sentry/nextjs removed from lock : " + (-not $hasNextjs))
Log ("nested postcss fix still present : " + $hasPostcss)
if ($hasNextjs) { Log "@sentry/nextjs still in lock - package.json and lock disagree. Stopping."; Log "DONE"; exit 1 }
if (-not $hasPostcss) { Log "The earlier postcss fix regressed. Stopping."; Log "DONE"; exit 1 }

$s = "migration/tanstack-start-app"
git add -- `
  "package.json" `
  "package-lock.json" `
  "$s/src/lib/monitoring/sentry.ts" `
  "$s/src/router.tsx" `
  "sentry.client.config.ts" `
  "sentry.server.config.ts" `
  "sentry.edge.config.ts" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(monitoring): restore error reporting, which has been dead since the cutover

Sentry was not running in production and had not been for some time. The repo
carried sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
and an @sentry/nextjs dependency, which reads as fully wired up. Those files are a
NEXT.JS convention - the Next SDK finds and loads them automatically. Next.js was
removed in the TanStack cutover, so nothing loaded them any more.

Verified before changing anything: nothing in the repo imports those three files,
no @sentry/* reference existed anywhere in src/, and the Start app declared no
Sentry package at all. So every crash since the cutover went unrecorded, while the
config files sitting in the tree stopped anyone noticing - which is worse than
having no monitoring, because there was nothing to prompt a look.

REPLACED WITH A DEPENDENCY-FREE REPORTER (src/lib/monitoring/sentry.ts).

@sentry/react would have pulled a large transitive tree and required regenerating
the Start app lockfile. Sentry's ingest endpoint accepts a plain HTTP envelope, so
this posts one with fetch: no new dependency, no lockfile churn for the Start app,
no bundle cost. Given up: automatic breadcrumbs, session replay, tracing. Kept:
unhandled errors actually reaching a dashboard, which is the point.

Design rules, in priority order:

1. NO DSN => COMPLETE NO-OP. Not "init with an empty dsn", which Sentry accepts
   and then quietly buffers. Nothing is installed, no handler registered, no
   network call. That is what makes this safe to ship BEFORE SENTRY_DSN exists in
   Coolify: behaviour today is byte-for-byte what it was.
2. NEVER LEAK SECRETS. Query strings are stripped from every URL before sending,
   and credentials are omitted so no cookies go to Sentry. This app puts project
   ids and preview tokens in URLs; a crash report must not become a credential
   leak. Asserted with a real token in a real URL.
3. NEVER BREAK THE APP. Reporting is fire-and-forget and fully wrapped; a
   monitoring failure cannot surface to a user or block a render.
4. NEVER SWALLOW. The global handlers report and then let default behaviour
   proceed - no preventDefault. Swallowing an error to "handle" it would hide the
   bugs this exists to reveal.

Initialised from getRouter() in router.tsx: the one entry point the TanStack Start
plugin calls on BOTH sides - client hydration and every SSR render - so one call
site covers both without a separate server bootstrap. Idempotent, so the per-render
cost is one boolean.

Verified with 16 assertions against the real module, transpiled and executed: both
files parse; no SDK import; the no-DSN path returns before any network; a valid DSN
produces exactly the documented envelope URL; the payload carries the error; and a
token planted in the page URL does NOT appear anywhere in the outgoing body. Root
lockfile regenerated and checked with `npm ci --dry-run` (1415 packages, down from
1540 now that Sentry's tree is gone); the Start app lock is untouched and still
passes at 739 packages. The nested-postcss entry from this morning's build fix was
explicitly re-checked and survives.

Still to do on the ops side: set SENTRY_DSN in Coolify. Until then this reports
nothing, by design, and says so rather than pretending.
'@

$f = "D:\Projects\lifemarkai\.git\SENTRY_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii

Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
