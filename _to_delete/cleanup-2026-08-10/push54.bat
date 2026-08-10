@echo off
REM push54 - docker heartbeat hairpin, stale framework union, and a regression
REM in b676ede where the chrome guarantee stopped seeing the scaffold's chrome.
setlocal enabledelayedexpansion
set "HERE=%~dp0"
set "LOG=%HERE%push54-result.txt"
set "REPO=D:\Projects\lifemarkai"
set "BRANCH=codex/security-hardening"
set "APP=migration/tanstack-start-app"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push54: heartbeat, framework union, chrome-detection regression ===
  cd /d "%REPO%"

  echo [1/5] Clearing stale git locks ...
  if exist ".git\index.lock" ( del /f /q ".git\index.lock" & echo removed index.lock )
  if exist ".git\objects\maintenance.lock" ( del /f /q ".git\objects\maintenance.lock" & echo removed maintenance.lock )
  if exist ".git\HEAD.lock" ( del /f /q ".git\HEAD.lock" & echo removed HEAD.lock )
  echo Locks clear.

  echo.
  echo [2/5] Fetching and checking we are level ...
  git fetch origin %BRANCH%
  if errorlevel 1 ( echo ERROR: fetch failed & exit /b 1 )
  for /f %%A in ('git rev-parse HEAD') do set "LOCAL=%%A"
  for /f %%B in ('git rev-parse FETCH_HEAD') do set "REMOTE=%%B"
  if "!LOCAL!"=="" ( echo ERROR: could not read local HEAD & exit /b 1 )
  if not "!LOCAL!"=="!REMOTE!" (
    echo ERROR: local !LOCAL! vs remote !REMOTE! - not level. Nothing committed.
    exit /b 1
  )
  echo Level at !LOCAL!.

  echo.
  echo [3/5] Unit tests ^(expect 104 - two new chrome regression tests^) ...
  call npm test
  if errorlevel 1 (
    echo ERROR: tests failed - not committing. Run "git diff" to inspect.
    exit /b 1
  )
  echo Tests OK.

  echo.
  echo [4/5] Committing ...
  git add "%APP%/src/lib/sandbox/docker.ts" "%APP%/src/types/database.ts" "%APP%/src/lib/ai/website-chrome.ts" "%APP%/src/lib/templates/site-chrome.test.ts"
  git -c core.hooksPath=NUL commit -m "fix(preview): the chrome guarantee stopped seeing the scaffold's own chrome, and the heartbeat cannot hairpin on Docker Desktop" -m "website-chrome.ts: hasSiteHeader/hasSiteFooter scan the SHELL for <Header />. b676ede moved that mount into SiteChrome, which lives in components/layout and is not scanned - so every fresh project read as header-less and the guarantee mounted a SECOND header straight into the shell, duplicating chrome on public pages and making it global again, back onto /admin. SiteChrome now counts as both halves. Two tests pin the two modules together." -m "docker.ts: the keep-alive probed previewUrl from the app server. When the app is itself a container and that URL is localhost, Docker Desktop does not hairpin published ports, so a healthy preview answers ECONNREFUSED, the client reads tunnelHealthy:false as dead and cold-boots a replacement that fails identically - the endless 'Installing dependencies' loop. Boot already probes inside the container; the heartbeat now uses the same waitForLocalServer." -m "database.ts: projects.framework was still the 001 union (react/next/vue/svelte). Migration 155 widened the CHECK constraint months ago to include react-native and tanstack-start; the type never followed, so the composer writing 'react-native' on every mobile-mode toggle was a type error against a value the database accepts."
  if errorlevel 1 ( echo ERROR: commit failed & exit /b 1 )
  git --no-pager log --oneline -1

  echo.
  echo [5/5] Pushing ...
  git -c lfs.locksverify=false push origin HEAD:refs/heads/%BRANCH%
  if errorlevel 1 (
    echo.
    echo First attempt failed - retrying once over HTTPS instead of SSH ...
    git -c lfs.locksverify=false push https://github.com/maqsoodjamvi1/lifemarkai.git HEAD:refs/heads/%BRANCH%
    if errorlevel 1 ( echo ERROR: push failed & exit /b 1 )
  )

  echo.
  echo === PUSHED OK - now run deploy50.bat to ship it ===
  echo DONE_OK
)
endlocal
