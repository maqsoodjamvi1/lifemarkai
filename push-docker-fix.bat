@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock
git add "migration/tanstack-start-app/src/lib/sandbox/docker.ts"
git commit -m "fix: docker sandbox reconnect resolves preview URL in Traefik proxy mode" -m "getPreviewUrl only knew port-mapping mode; in proxy mode there are no published ports, so reconnect() failed with 'Could not resolve the container's port' after every successful boot. Recover the hostname from the traefik router rule label."
git push origin codex/security-hardening
echo ===== done, HEAD is =====
git log --oneline -2
