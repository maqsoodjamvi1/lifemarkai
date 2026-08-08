@echo off
cd /d D:\Projects\lifemarkai
echo START > push3-result.txt
if exist .git\index.lock del /f .git\index.lock >> push3-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/deploy/build-project.ts >> push3-result.txt 2>&1
git commit -m "fix(publish): dev-install for server vite build (NODE_ENV=production omitted vite devDeps; rollup native module was missing)" >> push3-result.txt 2>&1
git push origin codex/security-hardening >> push3-result.txt 2>&1
git log --oneline -1 >> push3-result.txt 2>&1
echo PUSH3_DONE >> push3-result.txt
