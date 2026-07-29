@echo off
cd /d D:\Projects\lifemarkai
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if "%BRANCH%"=="master" ( echo REFUSING master > push-restart-gate-result.txt & exit /b 1 )
(
  echo BRANCH=%BRANCH%
  git add "migration/tanstack-start-app/src/lib/sandbox/docker.ts"
  git add "migration/tanstack-start-app/src/lib/sandbox/index.ts"
  git add "migration/tanstack-start-app/src/routes/api/projects/$id/sandbox-preview/sync.ts"
  echo ===== commit =====
  git commit -m "fix(preview): gate vite restart/npm install on files that ACTUALLY changed on disk - writeFiles now returns the diffed set from the content-hash manifest; keying on client-sent files still restarted every editor open because the baseline sync sends the FULL file set (verified live)"
  echo ===== push =====
  git push origin %BRANCH%
  echo ===== HEAD =====
  git log --oneline -2
) >> push-restart-gate-result.txt 2>&1
