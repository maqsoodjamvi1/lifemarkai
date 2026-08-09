@echo off
cd /d D:\Projects\lifemarkai
echo START > push9-result.txt
if exist .git\index.lock del /f .git\index.lock >> push9-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/ai/http/agent.ts >> push9-result.txt 2>&1
git commit -m "fix(agent): apply the site-chrome and dependency-pin guarantees on the agent build path too - it is the primary path for new projects" >> push9-result.txt 2>&1
git push origin codex/security-hardening >> push9-result.txt 2>&1
git log --oneline -1 >> push9-result.txt 2>&1
echo PUSH9_DONE >> push9-result.txt
