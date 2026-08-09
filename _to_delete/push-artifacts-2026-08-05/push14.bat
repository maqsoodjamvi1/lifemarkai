@echo off
cd /d D:\Projects\lifemarkai
echo START > push14-result.txt
if exist .git\index.lock del /f .git\index.lock >> push14-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/preview/preview-error-bridge.ts >> push14-result.txt 2>&1
git commit -m "fix(preview): Vite HMR websocket chatter no longer counts as an app error - it was hijacking the first build turn and shipping the bare scaffold" >> push14-result.txt 2>&1
git push origin codex/security-hardening >> push14-result.txt 2>&1
git log --oneline -1 >> push14-result.txt 2>&1
echo PUSH14_DONE >> push14-result.txt
