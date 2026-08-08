@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/ai/jsx-balance.ts migration/tanstack-start-app/src/lib/ai/code-parser.ts migration/tanstack-start-app/src/lib/ai/build-intent.ts > push25-result.txt 2>&1
git commit -m "fix(validate): reject unterminated string literals at generation time - an unescaped inch mark in seeded product data was killing whole modules" >> push25-result.txt 2>&1
git push origin codex/security-hardening >> push25-result.txt 2>&1
echo DONE >> push25-result.txt
