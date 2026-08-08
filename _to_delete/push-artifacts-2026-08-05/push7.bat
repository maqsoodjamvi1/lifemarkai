@echo off
cd /d D:\Projects\lifemarkai
echo START > push7-result.txt
if exist .git\index.lock del /f .git\index.lock >> push7-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/ai/website-chrome.ts migration/tanstack-start-app/src/lib/preview/align-package-json.ts migration/tanstack-start-app/src/lib/preview/base-app-deps.ts migration/tanstack-start-app/src/lib/preview/diagnose-imports.ts migration/tanstack-start-app/src/lib/ai/code-parser.ts migration/tanstack-start-app/src/lib/ai/website-header-contract.ts migration/tanstack-start-app/src/lib/ai/http/chat.ts >> push7-result.txt 2>&1
git commit -m "fix(build): React 19 for generated apps, guaranteed site header+footer, no false import errors on ?url and routeTree.gen" >> push7-result.txt 2>&1
git push origin codex/security-hardening >> push7-result.txt 2>&1
git log --oneline -1 >> push7-result.txt 2>&1
echo PUSH7_DONE >> push7-result.txt
