# remove-nextjs.ps1 — retire the Next.js app, leaving TanStack Start as the only
# application in this repo.
#
#   powershell -ExecutionPolicy Bypass -File .\remove-nextjs.ps1          # dry run
#   powershell -ExecutionPolicy Bypass -File .\remove-nextjs.ps1 -Apply   # do it
#
# ─────────────────────────────────────────────────────────────────────────────
#  READ THIS BEFORE -Apply
# ─────────────────────────────────────────────────────────────────────────────
# lifemarkai.com is CURRENTLY SERVED BY THE NEXT.JS APP, from branch `master`.
# The TanStack app builds and images cleanly but has never completed a boot.
#
# Run this on `codex/security-hardening` ONLY. Do not merge to `master` until a
# TanStack deploy has come up healthy — until then `master` is your rollback,
# and Coolify can switch branches back in about four minutes.
#
# Everything deleted here stays recoverable in git history; the tag below is a
# convenience handle so you don't have to hunt for the SHA.
param([switch]$Apply)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repo

# What the Next.js app consisted of. The TanStack app has its own copies of all
# of these under migration/tanstack-start-app/src — verified self-contained:
# no `next/*` imports and no relative paths reaching back into these folders.
$targets = @(
  "app",            # Next.js App Router: pages, layouts, API routes
  "components",     # superseded by migration/tanstack-start-app/src/components
  "hooks",          # superseded by .../src/hooks
  "store",          # Zustand store, unimported since the port
  "next-env.d.ts"   # Next.js ambient types
)

Write-Host ""
Write-Host "Branch: " -NoNewline; git rev-parse --abbrev-ref HEAD
Write-Host ""

if ((git rev-parse --abbrev-ref HEAD) -eq "master") {
  Write-Host "REFUSING: you are on master, which is what production serves." -ForegroundColor Red
  Write-Host "Switch to codex/security-hardening first." -ForegroundColor Red
  exit 1
}

$total = 0
foreach ($t in $targets) {
  if (Test-Path $t) {
    $n = (git ls-files $t | Measure-Object -Line).Lines
    $total += $n
    "{0,-16} {1,6} tracked files" -f $t, $n | Write-Host
  } else {
    "{0,-16} (absent)" -f $t | Write-Host
  }
}
Write-Host ""
Write-Host "Total: $total tracked files"
Write-Host ""

if (-not $Apply) {
  Write-Host "DRY RUN — nothing changed. Re-run with -Apply to delete." -ForegroundColor Yellow
  exit 0
}

# Safety handle before a large irreversible-feeling change.
git tag -f pre-nextjs-removal | Out-Null
Write-Host "Tagged current HEAD as 'pre-nextjs-removal'" -ForegroundColor Green

foreach ($t in $targets) {
  if (Test-Path $t) {
    git rm -r --quiet $t
    Write-Host "removed $t"
  }
}

Write-Host ""
Write-Host "Done. Review with 'git status', then:" -ForegroundColor Green
Write-Host "  git commit -m `"chore: remove Next.js app; TanStack Start is the only app`""
Write-Host "  git push origin codex/security-hardening"
Write-Host ""
Write-Host "Recover anything with:  git checkout pre-nextjs-removal -- <path>" -ForegroundColor Cyan
