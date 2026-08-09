@echo off
cd /d D:\Projects\lifemarkai
echo START > push12-result.txt
if exist .git\index.lock del /f .git\index.lock >> push12-result.txt 2>&1
git add migration/tanstack-start-app/src/components/dashboard/dashboard-hero.tsx migration/tanstack-start-app/src/components/dashboard/prompt-create-box.tsx migration/tanstack-start-app/src/components/onboarding/workspace-setup-wizard.tsx migration/tanstack-start-app/src/lib/server-fns/projects.ts migration/tanstack-start-app/src/lib/ai/system-prompts.ts migration/tanstack-start-app/src/lib/templates/lovable-vite-scaffold.ts >> push12-result.txt 2>&1
git commit -m "feat(templates): generate Lovable-shaped projects by default - Vite + React + TypeScript + shadcn, exact directory contract from a real Lovable export" >> push12-result.txt 2>&1
git push origin codex/security-hardening >> push12-result.txt 2>&1
git log --oneline -1 >> push12-result.txt 2>&1
echo PUSH12_DONE >> push12-result.txt
