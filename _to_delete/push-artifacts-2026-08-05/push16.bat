@echo off
cd /d D:\Projects\lifemarkai
git add migration/tanstack-start-app/src/lib/ai/jsx-balance.ts migration/tanstack-start-app/src/lib/ai/code-parser.ts migration/tanstack-start-app/src/lib/preview/push-to-sandbox.ts migration/tanstack-start-app/src/lib/server-fns/project-files.ts migration/tanstack-start-app/src/lib/ai/http/chat.ts migration/tanstack-start-app/src/lib/ai/http/agent.ts migration/tanstack-start-app/src/lib/ai/http/fix.ts > push16-result.txt 2>&1
git commit -m "fix: sync server-side file writes into running sandbox + reject unbalanced JSX at generation time" >> push16-result.txt 2>&1
git push origin codex/security-hardening >> push16-result.txt 2>&1
echo DONE >> push16-result.txt
