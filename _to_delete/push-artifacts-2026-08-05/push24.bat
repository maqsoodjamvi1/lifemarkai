@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/preview/patch-sandbox-preview-files.ts migration/tanstack-start-app/src/lib/preview/push-to-sandbox.ts migration/tanstack-start-app/src/lib/ai/build-intent.ts > push24-result.txt 2>&1
git commit -m "fix(preview): model-written vite.config no longer blocks the tunnel host - patch vite config on the live sync path too; add 9 B2B/industrial niche profiles" >> push24-result.txt 2>&1
git push origin codex/security-hardening >> push24-result.txt 2>&1
echo DONE >> push24-result.txt
