@echo off
cd /d D:\Projects\lifemarkai
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if "%BRANCH%"=="master" ( echo REFUSING master > push-incremental-result.txt & exit /b 1 )
(
  echo BRANCH=%BRANCH%
  git add "migration/tanstack-start-app/src/lib/sandbox/docker.ts"
  echo ===== commit =====
  git commit -m "fix(preview): incremental writeFiles via in-container content-hash manifest - full baseline sync on every editor open refreshed all mtimes, vite's own config watcher then full-restarted the dev server (2-3s down) and the iframe's first paint landed in that window. Now an open with no edits uploads NOTHING so vite never restarts; real edits still upload + HMR"
  echo ===== push =====
  git push origin %BRANCH%
  echo ===== HEAD =====
  git log --oneline -2
) >> push-incremental-result.txt 2>&1
