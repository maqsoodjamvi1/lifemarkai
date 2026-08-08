@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/hooks/use-preview-error-guard.ts migration/tanstack-start-app/src/lib/preview/preview-error-bridge.ts > push27-result.txt 2>&1
git commit -m "fix(preview): auto-resume a paused preview once a fresh document boots clean - the pause was a one-way door that outlived the error that caused it" >> push27-result.txt 2>&1
git push origin codex/security-hardening >> push27-result.txt 2>&1
echo DONE >> push27-result.txt
