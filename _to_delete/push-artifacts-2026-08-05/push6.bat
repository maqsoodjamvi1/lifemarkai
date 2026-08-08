@echo off
cd /d D:\Projects\lifemarkai
echo START > push6-result.txt
if exist .git\index.lock del /f .git\index.lock >> push6-result.txt 2>&1
git add migration/tanstack-start-app/src/lib/preview/preview-error-bridge.ts >> push6-result.txt 2>&1
git commit -m "fix(preview): hydration-recovery noise (removeChild, validateDOMNesting, hydration mismatch) no longer pauses the preview or triggers self-repair" >> push6-result.txt 2>&1
git push origin codex/security-hardening >> push6-result.txt 2>&1
git log --oneline -1 >> push6-result.txt 2>&1
echo PUSH6_DONE >> push6-result.txt
