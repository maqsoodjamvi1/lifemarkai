@echo off
setlocal
REM Push the four Claude commits WITHOUT touching D:\Projects\lifemarkai's
REM working tree. Commit 3 already contains the work you had uncommitted in
REM preview-panel.tsx, sandbox-url.ts and docker.ts, so after pulling you can
REM discard those three files' local edits.

set REPO=D:\Projects\lifemarkai
set WORK=%TEMP%\lifemarkai-push
set HOOKS=%TEMP%\lm-nohooks
set BRANCH=codex/security-hardening

echo === preparing a clean clone (this does not touch your working tree) ===
if exist "%WORK%" rmdir /s /q "%WORK%"
if not exist "%HOOKS%" mkdir "%HOOKS%"
REM This repo has a Git LFS post-checkout hook; skip hooks and smudging so a
REM missing git-lfs cannot fail the clone for no good reason.
set GIT_LFS_SKIP_SMUDGE=1
git -c core.hooksPath="%HOOKS%" clone --branch %BRANCH% --single-branch "%REPO%" "%WORK%"
if not exist "%WORK%\.git" goto :fail

cd /d "%WORK%"
git config core.hooksPath "%HOOKS%"
git remote remove origin
git remote add origin https://github.com/maqsoodjamvi1/lifemarkai.git
git config user.name "%USERNAME%"
git config user.email "maqsoodjamvi@gmail.com"

echo === applying the four commits ===
git am "%REPO%\lm-patches\0001-editor-async-effect-guards.patch" "%REPO%\lm-patches\0002-preview-engine.patch" "%REPO%\lm-patches\0003-preview-oauth-escape.patch" "%REPO%\lm-patches\0004-preview-boot-page.patch"
if errorlevel 1 goto :amfail

echo === pushing ===
git push origin HEAD:%BRANCH%
if errorlevel 1 goto :fail

echo.
echo ===== pushed. new commits: =====
git log --oneline -5
echo.
echo Your local repo is UNCHANGED. To bring these in:
echo    cd /d %REPO%
echo    git checkout -- migration/tanstack-start-app/src/components/editor/preview-panel.tsx
echo    git checkout -- migration/tanstack-start-app/src/lib/preview/sandbox-url.ts
echo    git checkout -- migration/tanstack-start-app/src/lib/sandbox/docker.ts
echo    git pull origin %BRANCH%
echo.
echo Those three checkouts discard your uncommitted edits ON PURPOSE - commit 3
echo already contains that work, with the missing guest-side handshake added.
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
