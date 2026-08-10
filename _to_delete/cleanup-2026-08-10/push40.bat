@echo off
REM Push the Lovable editor-parity commits (no clone; refs only).
setlocal
set "HERE=%~dp0"
set "BUNDLE=%HERE%lifemark-parity.bundle"
set "LOG=%HERE%push40-result.txt"
set "REPO=D:\Projects\lifemarkai"
set "BRANCH=codex/security-hardening"
set "TMPREF=refs/lm/parity"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push40: editor parity + test unbreak ===
  if not exist "%BUNDLE%" ( echo ERROR: bundle missing at %BUNDLE% & exit /b 1 )

  cd /d "%REPO%"

  echo [1/5] Fetching current remote branch ^(refs only^) ...
  git fetch origin %BRANCH%
  if errorlevel 1 ( echo ERROR: fetch from origin failed & exit /b 1 )
  echo Remote head:
  git rev-parse FETCH_HEAD

  echo.
  echo [2/5] Importing the bundle ...
  git fetch "%BUNDLE%" %BRANCH%:%TMPREF%
  if errorlevel 1 ( echo ERROR: bundle fetch failed & exit /b 1 )
  echo Bundle head:
  git rev-parse %TMPREF%

  echo.
  echo [3/5] Verifying fast-forward ...
  git merge-base --is-ancestor FETCH_HEAD %TMPREF%
  if errorlevel 1 (
    echo ERROR: not a fast-forward - remote moved. Nothing pushed.
    git update-ref -d %TMPREF%
    exit /b 1
  )
  echo OK.

  echo.
  echo [4/5] Commits to push:
  git --no-pager log --oneline FETCH_HEAD..%TMPREF%

  echo.
  echo [5/5] Pushing ^(LFS lock verify disabled for this command only^) ...
  git -c lfs.locksverify=false push origin %TMPREF%:refs/heads/%BRANCH%
  if errorlevel 1 (
    echo.
    echo First attempt failed - retrying once over HTTPS instead of SSH ...
    git -c lfs.locksverify=false push https://github.com/maqsoodjamvi1/lifemarkai.git %TMPREF%:refs/heads/%BRANCH%
    if errorlevel 1 ( echo ERROR: push failed & git update-ref -d %TMPREF% & exit /b 1 )
  )

  git update-ref -d %TMPREF%
  echo.
  echo === PUSHED OK ===
  git ls-remote origin %BRANCH%
  echo DONE_OK
)
endlocal
