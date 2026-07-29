@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add "lib/templates/tanstack-start-scaffold.ts" "migration/tanstack-start-app/src/lib/templates/tanstack-start-scaffold.ts" "migration/tanstack-start-app/scripts/build-ai-http.mjs" "migration/tanstack-start-app/src/lib/server-fns/project-files.ts" "migration/tanstack-start-app/src/routes/api/projects/$id/files.ts"
git commit -m "fix: prod editor save + AI worker boot + TSS scaffold deps" -m "- scaffold: override vite to ^7.0.0 (react-start peer dep); npm install exited 1 in preview sandbox" -m "- build-ai-http: define import.meta.env to process.env-backed global; worker crashed on load reading VITE_SUPABASE_URL" -m "- files API route: call plain functions instead of createServerFn wrappers; server-fn self-call returned unhandled HTTPError 500 on every editor save"
git push origin codex/security-hardening
echo ===== done, HEAD is =====
git log --oneline -2
git status --porcelain -uno
