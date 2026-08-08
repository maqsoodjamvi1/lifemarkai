@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/ai/build-intent.ts > push20-result.txt 2>&1
git commit -m "feat(build-intent): admin app-shell contract for POS/ERP/CRM/admin blueprints" >> push20-result.txt 2>&1
git push origin codex/security-hardening >> push20-result.txt 2>&1
echo DONE >> push20-result.txt
