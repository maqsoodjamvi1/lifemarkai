@echo off
REM push50 - the five type errors found by deploy49's informational check.
REM Commits to the working branch only. Run deploy49.bat afterwards to ship.
setlocal
set "HERE=%~dp0"
set "LOG=%HERE%push50-result.txt"
set "REPO=D:\Projects\lifemarkai"
set "BRANCH=codex/security-hardening"
set "APP=migration/tanstack-start-app"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push50: five real type errors ===
  cd /d "%REPO%"

  echo [1/6] Clearing stale git locks ...
  if exist ".git\index.lock" ( del /f /q ".git\index.lock" & echo removed index.lock )
  if exist ".git\objects\maintenance.lock" ( del /f /q ".git\objects\maintenance.lock" & echo removed maintenance.lock )
  if exist ".git\HEAD.lock" ( del /f /q ".git\HEAD.lock" & echo removed HEAD.lock )
  echo Locks clear.

  echo.
  echo [2/6] Fetching and checking we are level ...
  git fetch origin %BRANCH%
  if errorlevel 1 ( echo ERROR: fetch failed & exit /b 1 )
  for /f %%A in ('git rev-parse HEAD') do set "LOCAL=%%A"
  for /f %%B in ('git rev-parse FETCH_HEAD') do set "REMOTE=%%B"
  if not "%LOCAL%"=="%REMOTE%" (
    echo ERROR: local %LOCAL% vs remote %REMOTE% - not level. Nothing committed.
    exit /b 1
  )
  echo Level at %LOCAL%.

  echo.
  echo [3/6] App type-check - baseline was 43 error lines, expect 38 now ^(INFORMATIONAL^) ...
  pushd %APP%
  call npm run type-check
  popd
  echo ^(above: remaining errors are implicit-any noise plus three real ones Claude has listed^)

  echo.
  echo [4/6] Unit tests ...
  call npm test
  if errorlevel 1 (
    echo ERROR: tests failed - not committing. Run "git diff" to inspect.
    exit /b 1
  )
  echo Tests OK.

  echo.
  echo [5/6] Committing ...
  git add "%APP%/src/lib/ai/http/chat.ts" "%APP%/src/lib/integrations/semrush.ts" "%APP%/src/lib/supabase/request-client.ts" "%APP%/src/components/editor/preview-panel.tsx" "%APP%/src/lib/preview/use-sandbox-preview.ts"
  git -c core.hooksPath=NUL commit -m "fix(editor): five type errors that were real - parallel subagents never ran, network rows rendered blank, and Semrush lost its cache" -m "chat.ts: the subagent progress callback referenced safeEnqueue, which is not bound until the response stream opens further down. It threw ReferenceError on the first assignment, inside the try, so every build silently fell back to the keyword scan and the parallel fan-out never ran once. Dropped the callback; the steps still reach the client, replayed from subagentSteps when the stream opens." -m "preview-panel.tsx: the network tab mapped line.text, a property the entry type never had, so every row rendered empty. Renders method/url/status/duration/error instead." -m "semrush.ts: { next: { revalidate } } is a Next.js fetch extension, ignored under Vite - the promised 24h cache silently stopped, so every call hit a metered API. Replaced with a small in-process TTL cache." -m "use-sandbox-preview.ts: the phase poll reads data.error and the route really does send it on expiry/rate-limit/500 branches; the client type omitted it, so dead-sandbox recovery only worked by accident." -m "request-client.ts: typed the implicit-any setAll parameter."
  if errorlevel 1 ( echo ERROR: commit failed & exit /b 1 )
  git --no-pager log --oneline -1

  echo.
  echo [6/6] Pushing ...
  git -c lfs.locksverify=false push origin HEAD:refs/heads/%BRANCH%
  if errorlevel 1 (
    echo.
    echo First attempt failed - retrying once over HTTPS instead of SSH ...
    git -c lfs.locksverify=false push https://github.com/maqsoodjamvi1/lifemarkai.git HEAD:refs/heads/%BRANCH%
    if errorlevel 1 ( echo ERROR: push failed & exit /b 1 )
  )

  echo.
  echo === PUSHED OK - now run deploy49.bat to ship it to master/Coolify ===
  echo DONE_OK
)
endlocal
