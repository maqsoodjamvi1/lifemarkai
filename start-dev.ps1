# start-dev.ps1
# Run this from PowerShell (as a regular user, no admin needed) to:
#   1. Kill all zombie node.exe processes
#   2. Delete the rogue parent next.config.js that causes config warnings
#   3. Start the dev server with a 1 GB Node heap cap

Write-Host ""
Write-Host "=== LifemarkAI Dev Starter ===" -ForegroundColor Cyan
Write-Host ""

# Step 1 — Kill zombie Node processes
$nodeProcs = Get-Process -Name "node" -ErrorAction SilentlyContinue
if ($nodeProcs) {
    Write-Host "Killing $($nodeProcs.Count) node.exe process(es)..." -ForegroundColor Yellow
    $nodeProcs | Stop-Process -Force
    Start-Sleep -Seconds 1
    Write-Host "Done." -ForegroundColor Green
} else {
    Write-Host "No node.exe processes running — clean start." -ForegroundColor Green
}

# Step 2 — Delete rogue parent config files that override this project's config
$parentDir  = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$rogueConfig = Join-Path $parentDir "lifemarkai\next.config.js"
$rogueMiddleware = Join-Path $parentDir "lifemarkai\middleware.ts"

# The parent of D:\Projects\lifemarkai\lifemarkai is D:\Projects\lifemarkai
$parentConfig     = Join-Path (Split-Path $PSScriptRoot -Parent) "next.config.js"
$parentMiddleware = Join-Path (Split-Path $PSScriptRoot -Parent) "middleware.ts"

foreach ($file in @($parentConfig, $parentMiddleware)) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "Deleted rogue file: $file" -ForegroundColor Green
    }
}

# Step 3 — Start dev server
Write-Host ""
Write-Host "Starting dev server (heap cap: 1024 MB)..." -ForegroundColor Cyan
Write-Host "Open http://localhost:3000 in your browser."
Write-Host ""

Set-Location $PSScriptRoot
& npm run dev
