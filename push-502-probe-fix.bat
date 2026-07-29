@echo off
cd /d D:\Projects\lifemarkai
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if "%BRANCH%"=="master" ( echo REFUSING master > push-502-result.txt & exit /b 1 )
(
  echo BRANCH=%BRANCH%
  git add "migration/tanstack-start-app/src/lib/sandbox/shared.ts"
  echo ===== commit =====
  git commit -m "fix(preview): health probes must not count Traefik's 502 as 'server up' - behind a reverse proxy every request gets an HTTP response, so status>0 made boot readiness, keepAlive and the phase probe all report healthy while the pane showed Bad Gateway and no self-heal could ever fire. Gateway statuses (502/503/504) now read as backend-down"
  echo ===== push =====
  git push origin %BRANCH%
  echo ===== HEAD =====
  git log --oneline -2
) >> push-502-result.txt 2>&1
