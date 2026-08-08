@echo off
cd /d D:\Projects\lifemarkai
echo START > push15-result.txt
if exist .git\index.lock del /f .git\index.lock >> push15-result.txt 2>&1
git add migration/tanstack-start-app/src/components/editor/chat-panel.tsx >> push15-result.txt 2>&1
git commit -m "fix(build): a fresh project must not be mistaken for an existing codebase - count user-authored files, not scaffold files, when routing build vs agent" >> push15-result.txt 2>&1
git push origin codex/security-hardening >> push15-result.txt 2>&1
git log --oneline -1 >> push15-result.txt 2>&1
echo PUSH15_DONE >> push15-result.txt
