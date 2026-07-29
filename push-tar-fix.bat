@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add "migration/tanstack-start-app/src/lib/sandbox/docker.ts"
git commit -m "fix: sandbox tar upload emits node-owned directory entries" -m "Docker auto-created missing parent dirs as root:root while extracting, so the node user could never CREATE new files in them. TanStack Start's router generator rename into src/ (routeTree.gen.ts) failed with EACCES and the dev server died - ready phase + Traefik 502."
git push origin codex/security-hardening
echo ===== done, HEAD is =====
git log --oneline -2
