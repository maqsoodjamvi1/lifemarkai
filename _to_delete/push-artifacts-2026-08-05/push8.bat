@echo off
cd /d D:\Projects\lifemarkai
echo START > push8-result.txt
if exist .git\index.lock del /f .git\index.lock >> push8-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/ai/website-chrome.ts >> push8-result.txt 2>&1
git commit -m "fix(build): fill site header and footer independently - a build with a footer and no header is the common case, not a design choice" >> push8-result.txt 2>&1
git push origin codex/security-hardening >> push8-result.txt 2>&1
git log --oneline -1 >> push8-result.txt 2>&1
echo PUSH8_DONE >> push8-result.txt
