@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/preview/patch-sandbox-preview-files.ts migration/tanstack-start-app/src/lib/preview/base-app-deps.ts > push19-result.txt 2>&1
git commit -m "fix(preview): install tailwind config plugins the model references but never declares" >> push19-result.txt 2>&1
git push origin codex/security-hardening >> push19-result.txt 2>&1
echo DONE >> push19-result.txt
