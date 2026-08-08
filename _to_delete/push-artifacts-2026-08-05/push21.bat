@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/ai/self-verify.ts migration/tanstack-start-app/src/lib/ai/build-intent.ts > push21-result.txt 2>&1
git commit -m "feat(self-verify): sweep every app route in browser verification + sync fixes into running sandbox; data-shape and no-alert rules in app-shell contract" >> push21-result.txt 2>&1
git push origin codex/security-hardening >> push21-result.txt 2>&1
echo DONE >> push21-result.txt
