@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add migration/tanstack-start-app/src/lib/ai/build-intent.ts > push22-result.txt 2>&1
git commit -m "feat(build-intent): weighted-scoring rescue for vague prompts (merged from external review, word-boundary safe)" >> push22-result.txt 2>&1
git push origin codex/security-hardening >> push22-result.txt 2>&1
echo DONE >> push22-result.txt
