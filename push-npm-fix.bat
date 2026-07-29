@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add "lib/ai/npm-auto-install.ts" "migration/tanstack-start-app/src/lib/ai/npm-auto-install.ts"
git commit -m "fix: dependency auto-injection treats node:* imports as builtins" -m "TSS scaffold vite.config imports node:url; the injector added node:url@latest to package.json and npm install died with EINVALIDPACKAGENAME in the preview sandbox"
git push origin codex/security-hardening
echo ===== done, HEAD is =====
git log --oneline -2
