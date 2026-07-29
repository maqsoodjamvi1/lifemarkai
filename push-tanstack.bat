@echo off
cd /d D:\Projects\lifemarkai
(
  git rev-parse --abbrev-ref HEAD
  for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set BRANCH=%%b
) > push-result.txt 2>&1
if "%BRANCH%"=="master" ( echo REFUSING master >> push-result.txt & exit /b 1 )
(
  git add migration/tanstack-start-app/src/components/editor/preview-panel.tsx
  echo ===== staged =====
  git status --short
  echo ===== commit =====
  git commit -m "fix: preview iframe allow-popups-to-escape-sandbox so OAuth (Supabase/Google/GitHub) can complete in a new tab instead of 'refused to connect' when framed"
  echo ===== push =====
  git push origin %BRANCH%
  echo ===== HEAD =====
  git log --oneline -2
) >> push-result.txt 2>&1
