@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/ai/build-intent.ts > push18-result.txt 2>&1
git commit -m "fix(build-intent): explicit POS/ERP/CRM terms outrank storefront vocabulary in intent classification" >> push18-result.txt 2>&1
git push origin codex/security-hardening >> push18-result.txt 2>&1
echo DONE >> push18-result.txt
