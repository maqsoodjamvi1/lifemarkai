@echo off
REM ============================================================================
REM  Push the hydration fix WITHOUT cloning.
REM
REM  Uses the repo already at D:\Projects\lifemarkai, but only ever touches
REM  refs — never HEAD, never the index, never your working tree. Your
REM  uncommitted files are not read, moved, or changed.
REM ============================================================================
setlocal
set "HERE=%~dp0"
set "BUNDLE=%HERE%lifemark-hydration.bundle"
set "LOG=%HERE%push36-result.txt"
set "REPO=D:\Projects\lifemarkai"
set "BRANCH=codex/security-hardening"
set "TMPREF=refs/lm/hydration"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push36: hydration fix, no clone ===
  if not exist "%BUNDLE%" ( echo ERROR: bundle missing at %BUNDLE% & exit /b 1 )

  cd /d "%REPO%"
  echo.
  echo [1/5] Repo:
  git rev-parse --show-toplevel

  echo.
  echo [2/5] Fetching current remote branch (refs only, no checkout) ...
  git fetch origin %BRANCH%
  if errorlevel 1 ( echo ERROR: fetch from origin failed & exit /b 1 )
  git rev-parse FETCH_HEAD

  echo.
  echo [3/5] Importing the bundle into a temp ref ...
  git fetch "%BUNDLE%" %BRANCH%:%TMPREF%
  if errorlevel 1 ( echo ERROR: bundle fetch failed & exit /b 1 )
  git rev-parse %TMPREF%

  echo.
  echo [4/5] Verifying this is a fast-forward ...
  git merge-base --is-ancestor FETCH_HEAD %TMPREF%
  if errorlevel 1 (
    echo ERROR: not a fast-forward - remote has moved. Nothing pushed.
    git update-ref -d %TMPREF%
    exit /b 1
  )
  echo OK - fast-forward. Commits to push:
  git log --oneline FETCH_HEAD..%TMPREF%

  echo.
  echo [5/5] Pushing ...
  git push origin %TMPREF%:refs/heads/%BRANCH%
  if errorlevel 1 ( echo ERROR: push failed & git update-ref -d %TMPREF% & exit /b 1 )

  git update-ref -d %TMPREF%
  echo.
  echo === PUSHED OK ===
  git ls-remote origin %BRANCH%
  echo DONE_OK
)
endlocal
