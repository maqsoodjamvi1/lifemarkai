@echo off
cd /d D:\Projects\lifemarkai
echo START > push10-result.txt
if exist .git\index.lock del /f .git\index.lock >> push10-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/ai/http/agent.ts migration/tanstack-start-app/src/lib/templates/site-chrome.ts migration/tanstack-start-app/src/lib/templates/tanstack-start-scaffold.ts migration/tanstack-start-app/src/lib/templates/lovable-vite-scaffold.ts migration/tanstack-start-app/src/lib/ai/website-chrome.ts migration/tanstack-start-app/src/lib/server-fns/projects.ts >> push10-result.txt 2>&1
git commit -m "feat(templates): every new project ships a site header and footer in the scaffold, mounted in the root layout - one shared source for both scaffolds and the post-build guarantee" >> push10-result.txt 2>&1
git push origin codex/security-hardening >> push10-result.txt 2>&1
git log --oneline -1 >> push10-result.txt 2>&1
echo PUSH10_DONE >> push10-result.txt
