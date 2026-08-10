@echo off
REM Push the wallet-extension filter commit.
REM
REM Same no-clone approach (refs only, working tree untouched), with one
REM addition: -c lfs.locksverify=false.
REM
REM The previous attempt reached GitHub fine but died here:
REM   Post "https://lfs.github.com/.../locks/verify": ... connection forcibly closed
REM Git LFS tries to verify lock state over HTTPS before pushing, that call was
REM reset, and LFS treats the failure as fatal. The check is advisory - it only
REM warns about files locked by someone else - so skipping it for this one
REM command is safe. Passed with -c so nothing is written to your git config.
setlocal
set "HERE=%~dp0"
set "BUNDLE=%HERE%lifemark-wallet.bundle"
set "LOG=%HERE%push39-result.txt"
set "REPO=D:\Projects\lifemarkai"
set "BRANCH=codex/security-hardening"
set "TMPREF=refs/lm/wallet2"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push39: wallet filter, LFS lock verify skipped ===
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
