# cleanup-migration-stubs.ps1
#
# Run this FIRST, before `npm run dev`.
#
# During the migration I had to *empty* files instead of deleting them (the agent's
# filesystem mount blocks removal). One of those emptied files is a hard build-breaker:
#
#   src/routes/api/integrations/openai/openapi.json.ts  (0 bytes)
#
# The TanStack route generator scans src/routes and tries to inject a `Route` export
# into every file it finds. On a 0-byte module that produces malformed code and the
# generator THROWS — no route tree is written, so the whole app fails to start:
#
#   Error transforming route file .../openapi.json.ts: SyntaxError: Missing semicolon. (8:19)
#
# Verified: deleting it makes the generator succeed with 249 routes registered.
#
# Usage:   cd migration\tanstack-start-app ; .\cleanup-migration-stubs.ps1

$ErrorActionPreference = "Stop"
Write-Host "Cleaning migration stubs..." -ForegroundColor Cyan

# ── 1. CRITICAL: 0-byte route file that breaks the route generator ────────────
$critical = "src\routes\api\integrations\openai\openapi.json.ts"
if (Test-Path $critical) {
    Remove-Item $critical -Force
    Write-Host "  [CRITICAL] removed $critical" -ForegroundColor Yellow
}

# ── 2. Empty stray directories under src/routes ──────────────────────────────
@(
    "src\routes\api\integrations\openai\openapi.json",
    "src\routes\api\apps\`$id\mcp",
    "src\routes\api\components\21st"
) | ForEach-Object {
    if ((Test-Path $_) -and -not (Get-ChildItem $_ -Force)) {
        Remove-Item $_ -Force
        Write-Host "  removed empty dir $_"
    }
}

# ── 3. Retired modules (emptied to `// PHASE ...` stubs) ─────────────────────
# Safe: these live outside src/routes so the generator never sees them, but they
# are dead weight and confuse greps.
@(
    "src\lib\api-adapter.ts",
    "src\lib\api-worker-client.ts",
    "src\lib\dispatch-or-native.ts",
    "src\lib\worker-proxy.ts",
    "src\lib\sandbox-http.ts",
    "src\lib\sandbox-worker-client.ts",
    "src\lib\generated\api-route-coverage.json",
    "src\lib\server-fns\ai-json.ts",
    "src\lib\server-fns\proxy-json.ts",
    "scripts\api-http-worker.mjs",
    "scripts\build-api-manifest.mjs",
    "scripts\verify-api-coverage.mjs",
    "_gen_probe.mjs"
) | ForEach-Object {
    if (Test-Path $_) { Remove-Item $_ -Force; Write-Host "  removed $_" }
}

# ── 4. Clear stale AI-worker bundles ─────────────────────────────────────────
# .tmp/ai-http/{fix,chat,agent}.mjs were built BEFORE Phase 2, when
# scripts/build-ai-http.mjs bundled from the main repo (repoRoot/lib/ai/http).
# It now bundles from src/lib/ai/http. The worker only rebuilds when bundles are
# MISSING or LIFEMARK_AI_SKIP_REBUILD != 1 — and scripts/start-production.mjs sets
# that flag to "1", so PRODUCTION would silently ship the stale bundles.
# Deleting them forces a clean rebuild from the local sources.
if (Test-Path ".tmp\ai-http") {
    Remove-Item ".tmp\ai-http" -Recurse -Force
    Write-Host "  cleared stale .tmp\ai-http (forces rebuild from src/lib/ai/http)"
}

# ── 5. Guard: any OTHER zero-byte / stub file under src/routes would also break
#      the generator. Fail loudly rather than let it surface as a cryptic error.
$bad = Get-ChildItem src\routes -Recurse -File -Include *.ts,*.tsx |
       Where-Object { $_.Length -eq 0 -or
                      ($_.Length -lt 200 -and (Get-Content $_.FullName -Raw -EA SilentlyContinue) -like "// PHASE*") }
if ($bad) {
    Write-Host "`n  !! Zero-byte/stub route files remain — these WILL break the generator:" -ForegroundColor Red
    $bad | ForEach-Object { Write-Host "     $($_.FullName)" -ForegroundColor Red }
    exit 1
}

Write-Host "`nClean. Next:" -ForegroundColor Green
Write-Host "  npm install"
Write-Host "  npm run dev      # then verify: (Select-String src\routeTree.gen.ts -Pattern '^import \{ Route as').Count  -> 249"
