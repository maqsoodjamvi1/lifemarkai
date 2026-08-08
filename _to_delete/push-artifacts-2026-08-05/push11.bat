@echo off
cd /d D:\Projects\lifemarkai
echo START > push11-result.txt
if exist .git\index.lock del /f .git\index.lock >> push11-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/ai/http/agent.ts migration/tanstack-start-app/src/lib/templates/site-chrome.ts migration/tanstack-start-app/src/lib/templates/tanstack-start-scaffold.ts migration/tanstack-start-app/src/lib/templates/lovable-vite-scaffold.ts migration/tanstack-start-app/src/lib/ai/website-chrome.ts migration/tanstack-start-app/src/lib/server-fns/projects.ts migration/tanstack-start-app/src/lib/preview/align-package-json.ts migration/tanstack-start-app/src/lib/preview/diagnose-imports.ts >> push11-result.txt 2>&1
git commit -m "feat(templates): header+footer in the scaffold; fix chrome detection (mounted, not file-exists), App.tsx mounting, brand sanitising, dependency floors, import-checker false positives" >> push11-result.txt 2>&1
git push origin codex/security-hardening >> push11-result.txt 2>&1
git log --oneline -1 >> push11-result.txt 2>&1
echo PUSH11_DONE >> push11-result.txt
