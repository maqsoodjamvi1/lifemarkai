@echo off
cd /d D:\Projects\lifemarkai
echo START > push4-result.txt
if exist .git\index.lock del /f .git\index.lock >> push4-result.txt 2>&1
git add "migration/tanstack-start-app/src/routes/api/projects/$id/sandbox-preview.ts" >> push4-result.txt 2>&1
git commit -m "fix(preview): thumbnail .jpg in projects.preview_url no longer treated as the sandbox tunnel (X-Frame-Options 'refused to connect')" >> push4-result.txt 2>&1
git push origin codex/security-hardening >> push4-result.txt 2>&1
git log --oneline -1 >> push4-result.txt 2>&1
echo PUSH4_DONE >> push4-result.txt
