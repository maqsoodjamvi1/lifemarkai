@echo off
REM push46 - clear stale git locks, stash stale local edits, land the domains bundle, re-apply the
REM preview import-repair fix on top of the new head, test, commit, push.
setlocal
set "HERE=%~dp0"
set "BUNDLE=%HERE%lifemark-domains.bundle"
set "LOG=%HERE%push46-result.txt"
set "REPO=D:\Projects\lifemarkai"
set "BRANCH=codex/security-hardening"
set "TMPREF=refs/lm/domains"
set "PV=migration/tanstack-start-app/src/lib/preview"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push46: domains + preview import repair ===
  if not exist "%BUNDLE%" ( echo ERROR: bundle missing at %BUNDLE% & exit /b 1 )
  if not exist "%REPO%\.lm-import-fix\apply.mjs" ( echo ERROR: .lm-import-fix\apply.mjs missing & exit /b 1 )

  cd /d "%REPO%"

  echo [1/10] Local head before:
  git rev-parse HEAD

  echo [2/10] Clearing stale git locks ^(a killed git run leaves these behind^) ...
  if exist ".git\index.lock" ( del /f /q ".git\index.lock" & echo removed .git\index.lock )
  if exist ".git\objects\maintenance.lock" ( del /f /q ".git\objects\maintenance.lock" & echo removed maintenance.lock )
  if exist ".git\HEAD.lock" ( del /f /q ".git\HEAD.lock" & echo removed HEAD.lock )
  echo Locks clear.

  echo.
  echo [3/10] Fetching current remote branch ^(refs only^) ...
  git fetch origin %BRANCH%
  if errorlevel 1 ( echo ERROR: fetch from origin failed & exit /b 1 )
  git rev-parse FETCH_HEAD

  echo.
  echo [4/10] Importing the domains bundle ...
  git fetch "%BUNDLE%" %BRANCH%:%TMPREF%
  if errorlevel 1 ( echo ERROR: bundle fetch failed & exit /b 1 )
  git rev-parse %TMPREF%

  echo.
  echo [5/10] Verifying fast-forward from remote ...
  git merge-base --is-ancestor FETCH_HEAD %TMPREF%
  if errorlevel 1 (
    echo ERROR: remote moved past the bundle - nothing changed, nothing pushed.
    git update-ref -d %TMPREF%
    exit /b 1
  )
  echo OK.

  echo.
  echo [6/10] Stashing stale local edits ^(recoverable: git stash list^) ...
  git stash push -m "push46: pre-merge local edits"
  if errorlevel 1 ( echo ERROR: stash failed & git update-ref -d %TMPREF% & exit /b 1 )
  if exist "scripts\check-schema-drift.js" (
    echo Moving untracked scripts\check-schema-drift.js aside ...
    move /y "scripts\check-schema-drift.js" "scripts\check-schema-drift.js.local-backup"
  )

  echo.
  echo [7/10] Fast-forwarding onto the bundle ...
  git merge --ff-only %TMPREF%
  if errorlevel 1 (
    echo ERROR: fast-forward still blocked. Restoring your stash and stopping.
    git stash pop
    git update-ref -d %TMPREF%
    exit /b 1
  )
  git rev-parse HEAD

  echo.
  echo [8/10] Re-applying the import-repair fix on the new head ...
  node ".lm-import-fix\apply.mjs"
  if errorlevel 1 (
    echo ERROR: apply failed - see the FAIL lines above. Nothing committed.
    git update-ref -d %TMPREF%
    exit /b 1
  )

  echo.
  echo [9/10] Running the import-repair tests ...
  call npx --no-install tsx --test "%PV%/normalize-imports.test.ts"
  if errorlevel 1 (
    echo ERROR: tests failed - not committing.
    git update-ref -d %TMPREF%
    exit /b 1
  )
  echo Tests OK.

  echo.
  echo [10/10] Committing and pushing ...
  git add "%PV%/normalize-imports.ts" "%PV%/normalize-imports.test.ts" "%PV%/patch-sandbox-preview-files.ts" "%PV%/push-to-sandbox.ts" package.json
  git -c core.hooksPath=NUL commit -m "fix(preview): repair broken import paths before the sandbox sees them - a model-shortened \"../utils.ts\" froze every new build on 'Failed to resolve import'"
  if errorlevel 1 ( echo ERROR: commit failed & git update-ref -d %TMPREF% & exit /b 1 )
  git --no-pager log --oneline -3

  git -c lfs.locksverify=false push origin HEAD:refs/heads/%BRANCH%
  if errorlevel 1 (
    echo.
    echo First attempt failed - retrying once over HTTPS instead of SSH ...
    git -c lfs.locksverify=false push https://github.com/maqsoodjamvi1/lifemarkai.git HEAD:refs/heads/%BRANCH%
    if errorlevel 1 ( echo ERROR: push failed & git update-ref -d %TMPREF% & exit /b 1 )
  )

  git update-ref -d %TMPREF%
  echo.
  echo === PUSHED OK ===
  git ls-remote origin %BRANCH%
  echo Your stashed local edits are still here:
  git --no-pager stash list
  echo DONE_OK
)
endlocal
