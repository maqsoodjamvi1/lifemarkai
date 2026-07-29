@echo off
cd /d D:\Projects\lifemarkai
for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
if "%BRANCH%"=="master" ( echo REFUSING master > push-paint-result.txt & exit /b 1 )
(
  echo BRANCH=%BRANCH%
  git add "migration/tanstack-start-app/src/lib/preview/use-sandbox-preview.ts"
  echo ===== commit =====
  git commit -m "fix(preview): paint watchdog - verified live that a healthy sandbox can still show a blank iframe (loaded during a transient; browsers never refetch). Use the VEB bridge's lifemark-veb-ready ping as a paint signal; no ping within 6s of ready = force iframe reload via reloadNonce, 3 attempts with backoff"
  echo ===== push =====
  git push origin %BRANCH%
  echo ===== HEAD =====
  git log --oneline -2
) >> push-paint-result.txt 2>&1
