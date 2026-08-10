@echo off
REM Push the install-skip safety fix. Log goes to push34-result.txt.
setlocal
set "HERE=%~dp0"
set "BUNDLE=%HERE%lifemark-fix.bundle"
set "LOG=%HERE%push34-result.txt"
set "WORK=%TEMP%\lm-push34"
set "BRANCH=codex/security-hardening"

> "%LOG%" 2>&1 (
  echo === LifemarkAI push34: install-skip safety fix ===
  if not exist "%BUNDLE%" ( echo ERROR: bundle missing at %BUNDLE% & exit /b 1 )
  if exist "%WORK%" rmdir /s /q "%WORK%"

  echo [1/5] Cloning ...
  git clone --branch %BRANCH% --single-branch https://github.com/maqsoodjamvi1/lifemarkai.git "%WORK%"
  if errorlevel 1 ( echo ERROR: clone failed & exit /b 1 )

  cd /d "%WORK%"
  echo.
  echo [2/5] Remote head before:
  git log --oneline -1

  echo.
  echo [3/5] Importing bundle ...
  git fetch "%BUNDLE%" %BRANCH%:refs/remotes/bundle/%BRANCH%
  if errorlevel 1 ( echo ERROR: bundle fetch failed & exit /b 1 )

  echo.
  echo [4/5] Fast-forward ...
  git merge --ff-only refs/remotes/bundle/%BRANCH%
  if errorlevel 1 ( echo ERROR: not a fast-forward - remote moved. Nothing pushed. & exit /b 1 )

  echo.
  echo Commits to push:
  git log --oneline e9e01d6..HEAD

  echo.
  echo [5/5] Pushing ...
  git push origin %BRANCH%
  if errorlevel 1 ( echo ERROR: push failed & exit /b 1 )

  echo.
  echo === PUSHED OK. New remote head: ===
  git log --oneline -1
  echo DONE_OK
)
endlocal
