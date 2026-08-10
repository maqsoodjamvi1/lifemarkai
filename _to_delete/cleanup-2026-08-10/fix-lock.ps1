# Commit the regenerated root package-lock.json and push, which re-triggers the
# Coolify build.
#
# WHAT BROKE THE DEPLOY: `npm ci` refused with
#     Missing: postcss@8.4.31 from lock file
# next@16.2.6 is still in the lock as a PEER dependency (pulled in by @sentry/nextjs
# and geist, plus next-themes and eslint-config-next are still direct deps), and next
# pins postcss to exactly 8.4.31. The lock had only the hoisted postcss 8.5.12 and no
# nested entry for next's pin, so the tree it described could not satisfy
# package.json. npm install tolerates that; npm ci - correctly - does not.
#
# The lock was regenerated with npm 10.9.8 / node 22, the SAME versions the build
# image uses, so what was verified here is what the build will resolve. It now
# contains node_modules/next/node_modules/postcss, and `npm ci --dry-run` completes
# (1540 packages). The Start app lock was checked the same way (739 packages) so the
# build does not simply fail one step later.
#
# NOT DONE HERE, deliberately: removing the leftover Next.js packages. They are real
# cruft after the TanStack cutover, but ripping four dependencies out while production
# is down turns one problem into two. Separate change, once the deploy is green.
#
# INTEGRITY CHECK FIRST: the lock was written through the Cowork mount, which has
# truncated large files before. If the byte count or JSON parse fails, this stops
# rather than committing a corrupt lockfile - which would break the build worse than
# it already is.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\fix-lock-result.txt"
"=== FIX LOCK $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$EXPECTED_BYTES = 793243
$lock = "D:\Projects\lifemarkai\package-lock.json"

Log "--- integrity of the regenerated lock, as Windows sees it ---"
if (-not (Test-Path $lock)) { Log "package-lock.json MISSING. Stopping."; Log "DONE"; exit 1 }
$len = (Get-Item $lock).Length
Log ("bytes   = " + $len + "  (expected " + $EXPECTED_BYTES + ")")
if ($len -ne $EXPECTED_BYTES) {
  Log "SIZE MISMATCH - the file was likely truncated in transit. NOT committing."
  Log "DONE"; exit 1
}
# Validate with NODE, not ConvertFrom-Json.
#
# PowerShell 5.1's ConvertFrom-Json builds a PSCustomObject and cannot create a
# property whose name is the empty string - and a lockfile has exactly that:
# "packages": { "": { ...the root package... }}. So it reports
#   'the value of argument "name" is not valid'
# on a perfectly valid lockfile. That false positive blocked this commit once
# already. node is also the authority that actually has to read this file.
$nodeCheck = & node -e "try{JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log('OK')}catch(e){console.log('FAIL '+e.message)}" $lock 2>&1
Log ("JSON    = " + $nodeCheck)
if ("$nodeCheck" -notmatch "^OK") {
  Log "NOT committing a corrupt lockfile."
  Log "DONE"; exit 1
}

# Cross-check the package count node resolves, so a valid-but-wrong file is caught too.
$pkgCount = & node -e "const l=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));console.log(Object.keys(l.packages).length)" $lock 2>&1
Log ("entries = " + $pkgCount + " packages recorded")

# The specific entry whose absence broke the build.
$hasNested = (Select-String -Path $lock -SimpleMatch 'node_modules/next/node_modules/postcss' -Quiet)
if ($hasNested) { Log "nested postcss entry present (this is the fix)" }
else { Log "nested postcss entry ABSENT - wrong file. NOT committing."; Log "DONE"; exit 1 }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log ""
Log "branch = $branch"

git add -- "package-lock.json" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(build): resync root package-lock.json so npm ci can install again

The Coolify build failed at `npm ci` with:

    Missing: postcss@8.4.31 from lock file

next@16.2.6 is still present in the lockfile as a PEER dependency - @sentry/nextjs
and geist both peer-depend on next, and next-themes and eslint-config-next are still
direct dependencies after the TanStack cutover. next pins postcss to exactly 8.4.31,
but the lock carried only the hoisted postcss 8.5.12 with no nested entry for that
pin, so the tree it described could not satisfy package.json.

`npm install` tolerates that mismatch, which is why this went unnoticed locally;
`npm ci` refuses, which is correct and is what the Docker build runs. The lock was
also missing any record of the form-data override that package.json declares - the
same class of drift.

Regenerated with npm 10.9.8 on node 22, matching the build image exactly, so the
resolution verified here is the resolution the build will get. It now contains
node_modules/next/node_modules/postcss, and `npm ci --dry-run` completes cleanly
(1540 packages). The Start app lock was checked the same way (739 packages), so the
build will not fail one step later for the same reason.

NOT changed here: the leftover Next.js dependencies themselves. They are genuine
cruft now that nothing renders through Next, but removing four packages while the
deployment is broken would turn one problem into two. That is a separate change once
this build is green.
'@

$f = "D:\Projects\lifemarkai\.git\FIXLOCK_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii

git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log ""
Log "Coolify builds this BRANCH (not master), so this push should trigger a new"
Log "deployment on its own. Watch the build log."
Log "DONE"
