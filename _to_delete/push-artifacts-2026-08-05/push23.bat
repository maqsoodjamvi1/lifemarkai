@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/ai/build-intent.ts > push23-result.txt 2>&1
git commit -m "feat(build-intent): 14 vertical app types, industry data profiles, site-intent guard and cleaner niche extraction" >> push23-result.txt 2>&1
git push origin codex/security-hardening >> push23-result.txt 2>&1
echo DONE >> push23-result.txt
