@echo off
cd /d D:\Projects\lifemarkai
echo START > push2-result.txt
git add migration/tanstack-start-app/src/lib/deploy/build-project.ts >> push2-result.txt 2>&1
git commit -m "fix(publish): dev-install for server vite build (NODE_ENV=production omitted vite devDeps; rollup native module was missing)" >> push2-result.txt 2>&1
git push origin codex/security-hardening >> push2-result.txt 2>&1
git log --oneline -1 >> push2-result.txt 2>&1
echo PUSH2_DONE >> push2-result.txt
