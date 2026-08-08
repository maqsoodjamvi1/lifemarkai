@echo off
setlocal
REM Push the editor silent-failure fix, the blank-preview watchdog fix and
REM the warm container reuse. Builds them in a throwaway clone under %TEMP%
REM and pushes from there, so your working tree is never touched.

set REPO=D:\Projects\lifemarkai
set WORK=%TEMP%\lifemarkai-push31
set HOOKS=%TEMP%\lm-nohooks
set BRANCH=codex/security-hardening

echo === cloning the pushed branch from GitHub ===
if exist "%WORK%" rmdir /s /q "%WORK%"
if not exist "%HOOKS%" mkdir "%HOOKS%"
set GIT_LFS_SKIP_SMUDGE=1
git -c core.hooksPath="%HOOKS%" clone --branch %BRANCH% --single-branch https://github.com/maqsoodjamvi1/lifemarkai.git "%WORK%"
if not exist "%WORK%\.git" goto :fail

cd /d "%WORK%"
git config core.hooksPath "%HOOKS%"
git config user.name "%USERNAME%"
git config user.email "maqsoodjamvi@gmail.com"

echo === applying the five commits ===
git am "%REPO%\lm-patches\0005-editor-ai-failure-messages.patch" "%REPO%\lm-patches\0006-preview-paint-watchdog.patch" "%REPO%\lm-patches\0007-preview-warm-container-reuse.patch" "%REPO%\lm-patches\0008-preview-reuse-hardening.patch" "%REPO%\lm-patches\0009-preview-shared-node-modules.patch"
if errorlevel 1 goto :amfail

echo === pushing ===
git push origin HEAD:%BRANCH%
if errorlevel 1 goto :fail

echo.
echo ===== pushed. new commits: =====
git log --oneline -7
goto :done

:amfail
echo.
echo git am failed. Nothing was pushed. Run:  git am --abort
goto :done

:fail
echo.
echo Something failed above. Nothing was pushed.

:done
cd /d "%REPO%"
pause
