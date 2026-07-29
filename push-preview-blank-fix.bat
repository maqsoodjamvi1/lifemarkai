@echo off
cd /d D:\Projects\lifemarkai
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if "%BRANCH%"=="master" ( echo REFUSING master > push-preview-blank-result.txt & exit /b 1 )
(
  echo BRANCH=%BRANCH%
  git add "migration/tanstack-start-app/src/lib/preview/patch-vite-for-webcontainer.ts"
  git add "migration/tanstack-start-app/src/lib/preview/use-sandbox-preview.ts"
  git add "migration/tanstack-start-app/src/lib/sandbox/docker.ts"
  git add "migration/tanstack-start-app/src/routes/api/projects/$id/sandbox-preview/sync.ts"
  git add "migration/tanstack-start-app/src/routes/api/projects/$id/sandbox-preview.ts"
  git add "migration/tanstack-start-app/scripts/setup-sandbox-host.sh"
  echo ===== staged =====
  git status --short
  echo ===== commit =====
  git commit -m "fix(preview): production-grade sandbox stability - one container per project (teardown before create + per-project provision lock; concurrent heartbeat/phase-poll reboots collapsed), keepAlive grace window for supervisor vite restarts (+restarted signal, keepalive touch for GC), sync no longer pkills vite on every baseline re-sync (+provider-correct restart path), React dedupe in vite patcher, unreachable phase now auto-recovers, idle-aware GC with per-project dedupe, remove debug ingest calls"
  echo ===== push =====
  git push origin %BRANCH%
  echo ===== HEAD =====
  git log --oneline -3
) >> push-preview-blank-result.txt 2>&1
