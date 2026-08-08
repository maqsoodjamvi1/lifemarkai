@echo off
cd /d D:\Projects\lifemarkai
echo START > push13-result.txt
if exist .git\index.lock del /f .git\index.lock >> push13-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/preview/patch-sandbox-preview-files.ts >> push13-result.txt 2>&1
git commit -m "fix(preview): point Vite HMR at the tunnel (wss on 443) so previews stop reporting a websocket failure and self-repair stops editing vite.config.ts" >> push13-result.txt 2>&1
git push origin codex/security-hardening >> push13-result.txt 2>&1
git log --oneline -1 >> push13-result.txt 2>&1
echo PUSH13_DONE >> push13-result.txt
