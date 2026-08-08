@echo off
cd /d D:\Projects\lifemarkai
echo START > push5-result.txt
if exist .git\index.lock del /f .git\index.lock >> push5-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/preview/veb-bridge.ts >> push5-result.txt 2>&1
git commit -m "fix(preview): bridge injector kept lowercasing </Body> in JSX documents - unclosed <Body> 500'd TSS previews at SSR" >> push5-result.txt 2>&1
git push origin codex/security-hardening >> push5-result.txt 2>&1
git log --oneline -1 >> push5-result.txt 2>&1
echo PUSH5_DONE >> push5-result.txt
