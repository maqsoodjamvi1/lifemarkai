@echo off
REM Push the script-terminator fix using the existing repo (no clone).
REM Touches refs only - never HEAD, never the index, never your working tree.
setlocal
set "HERE=%~dp0"
set "BUNDLE=%HERE%lifemark-wallet.bundle"
set "LOG=%HERE%push38-result.txt"
set "REPO=D:\Projects\lifemarkai"
set "BRANCH=codex/security-hardening"
set "TMPREF=refs/lm/wallet"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push38: wallet-extension error filter ===
  if not exist "%BUNDLE%" ( echo ERROR: bundle missing at %BUNDLE% & exit /b 1 )

  cd /d "%REPO%"
  echo [1/5] Repo:
  git rev-parse --show-toplevel

  echo.
  echo [2/5] Fetching current remote branch ^(refs only^) ...
  git fetch origin %BRANCH%
  if errorlevel 1 ( echo ERROR: fetch from origin failed & exit /b 1 )
  git rev-parse FETCH_HEAD

  echo.
  echo [3/5] Importing the bundle into a temp ref ...
  git fetch "%BUNDLE%" %BRANCH%:%TMPREF%
  if errorlevel 1 ( echo ERROR: bundle fetch failed & exit /b 1 )
  git rev-parse %TMPREF%

  echo.
  echo [4/5] Verifying fast-forward ...
  git merge-base --is-ancestor FETCH_HEAD %TMPREF%
  if errorlevel 1 (
    echo ERROR: not a fast-forward - remote moved. Nothing pushed.
    git update-ref -d %TMPREF%
    exit /b 1
  )
  echo OK. Commits to push:
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
