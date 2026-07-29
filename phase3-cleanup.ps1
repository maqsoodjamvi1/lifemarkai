# PHASE 3 - remove every remaining Next.js-era artifact; TanStack Start only.
# ASCII only. Run:  powershell -NoProfile -ExecutionPolicy Bypass -File D:\Projects\lifemarkai\phase3-cleanup.ps1
$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase3-cleanup-result.txt"
"=== PHASE 3 CLEANUP $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii

function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }

# --- 1. Port the 9 live-relevant tests from root lib/ into the TanStack app ---
# They use relative sibling imports (./code-parser etc), so dropping them next to
# the live module makes them test the REAL code instead of the dead root copy.
$startLib = "migration\tanstack-start-app\src\lib"
$tests = @(
  @("lib\ai\code-parser.test.ts",            "$startLib\ai\code-parser.test.ts"),
  @("lib\ai\chat-capabilities.test.ts",      "$startLib\ai\chat-capabilities.test.ts"),
  @("lib\ai\skill-matcher.test.ts",          "$startLib\ai\skill-matcher.test.ts"),
  @("lib\ai\stream-file-paths.test.ts",      "$startLib\ai\stream-file-paths.test.ts"),
  @("lib\security\static-scan.test.ts",      "$startLib\security\static-scan.test.ts"),
  @("lib\preview\diagnose-preview.test.ts",  "$startLib\preview\diagnose-preview.test.ts"),
  @("lib\auth\safe-redirect.test.ts",        "$startLib\auth\safe-redirect.test.ts"),
  @("lib\api\array-response.test.ts",        "$startLib\api\array-response.test.ts"),
  @("lib\build-with-url.test.ts",            "$startLib\build-with-url.test.ts")
)
Log ""
Log "--- porting tests to TanStack app ---"
foreach ($t in $tests) {
  if (Test-Path $t[0]) {
    $destDir = Split-Path $t[1] -Parent
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $t[0] $t[1] -Force
    Log ("  ported " + $t[1])
  } else {
    Log ("  MISSING (skipped) " + $t[0])
  }
}

# --- 2. Delete root scripts that import the dead root lib/ ---
Log ""
Log "--- deleting root scripts that import ../lib ---"
$deadScripts = Get-ChildItem "scripts\*.ts" -ErrorAction SilentlyContinue |
  Where-Object { (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue) -match '\.\./lib/' }
foreach ($s in $deadScripts) { Remove-Item $s.FullName -Force; Log ("  rm " + $s.Name) }
Log ("  total: " + $deadScripts.Count)

# --- 3. Delete dead Next.js-era trees and tombstones ---
Log ""
Log "--- deleting dead trees ---"
$deadPaths = @(
  "lib",
  "types",
  "app",
  "$startLib\next-shims",
  "$startLib\next-dynamic.tsx",
  "migration\tanstack-start-app\scripts\build-api-manifest.mjs",
  "migration\tanstack-start-app\scripts\verify-api-coverage.mjs",
  "migration\tanstack-start-app\scripts\api-http-worker.mjs"
)
foreach ($p in $deadPaths) {
  if (Test-Path $p) { Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue; Log "  rm $p" }
  else { Log "  (absent) $p" }
}

# --- 4. Report what remains ---
Log ""
Log "--- post-clean verification ---"
Log ("root lib exists:        " + (Test-Path "lib"))
Log ("root types exists:      " + (Test-Path "types"))
Log ("root app exists:        " + (Test-Path "app"))
Log ("next-shims exists:      " + (Test-Path "$startLib\next-shims"))
Log ("next-dynamic exists:    " + (Test-Path "$startLib\next-dynamic.tsx"))
$nextRefs = Select-String -Path "migration\tanstack-start-app\src\*.ts","migration\tanstack-start-app\src\**\*.ts","migration\tanstack-start-app\src\**\*.tsx" -Pattern 'from "next/' -ErrorAction SilentlyContinue
Log ("real next/ imports in src: " + $nextRefs.Count)

# --- 5. Commit + push ---
Log ""
Log "--- git ---"
git add -A 2>&1 | Out-File $log -Append -Encoding ascii
git commit -m "chore(phase3): delete all Next.js-era residue - TanStack Start only

- remove root lib/ (194 dead files), types/, and the empty app/ shell; vite
  resolves @/ inside src/ only, so none of it was reachable from the live app
- port the 9 still-relevant tests onto the LIVE modules in the Start app
  (they used relative sibling imports, so they now cover real code instead of
  the dead root copies) and repoint npm test at them
- delete 41 root verify-*.ts scripts that imported the dead root lib/, plus the
  npm script entries that ran them - they were asserting against dead code
- remove src/lib/next-shims (7 files) and its esbuild aliases together; a walk
  of the AI worker import graph (282 files) proved zero server-only/next-server/
  next-headers imports
- remove orphaned src/lib/next-dynamic.tsx (lazy-component.tsx already replaced it)
- drop dead next scripts + npm overrides block from root package.json; repoint
  dev-with-warm at the TanStack dev server (it spawned the removed dev:next)
- drop the two no-op tombstone steps from the Docker build chain and correct the
  stale 4-process header (only the Start server + AI worker run)" 2>&1 | Out-File $log -Append -Encoding ascii

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log "--- HEAD ---"
git log --oneline -2 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
