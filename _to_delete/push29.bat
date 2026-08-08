@echo off
cd /d D:\Projects\lifemarkai
if exist .git\index.lock del /f .git\index.lock

echo === commit 1/2: async-effect race guards ===
git add "migration/tanstack-start-app/src/components/editor/chat-panel.tsx" "migration/tanstack-start-app/src/components/editor/design-preview-picker.tsx" "migration/tanstack-start-app/src/components/editor/domain-buy-modal.tsx" "migration/tanstack-start-app/src/components/editor/mcp-context-panel.tsx" "migration/tanstack-start-app/src/components/editor/packages-panel.tsx" "migration/tanstack-start-app/src/components/editor/preview-annotations.tsx" "migration/tanstack-start-app/src/components/editor/project-site-analytics-panel.tsx"
git commit -m "fix(editor): guard async effects whose cleanup only cancelled the timer, not the request" -m "Chat search, npm package search and the domain-availability lookup all painted results for a query the user had stopped typing, because a slow early request lands after a fast later one - and cleared the spinner while the real one was still running. The design-direction picker could fire onSkip() from a previous open and dismiss a modal the user was looking at. Site analytics let a 7d response (or a poll fired under the old range) overwrite the 90d data just switched to; the spinner now carries its own token so a poll can never strand loading at true. The MCP context panel re-enabled sources the user had just disconnected when a refreshKey bump raced the env lookup." -m "preview-annotations had a different bug in the same family: initial state is seeded once from whichever project mounted first, so a project switch without a remount kept the previous project's pins - and the persist effect then wrote them onto the new project's cache and, once hydration settled, its chat-state. Hydration now swaps in the incoming project's cache and the first persist pass after a switch is skipped."

echo === commit 2/2: preview panel ===
git add "migration/tanstack-start-app/src/components/editor/preview-panel.tsx" "migration/tanstack-start-app/src/lib/preview/sandbox-url.ts"
git commit -m "fix(preview): supersede an in-flight sandbox sync, and land the OAuth-escape bridge work" -m "The live-sync effect re-runs on every edit but only cleared its 800ms debounce, so a superseded run kept going: it could raise the destructive 'Preview out of date' toast for a sync that had since succeeded, and its trailing timers could flip the machine to ready underneath a sync still loading. The run is now superseded whole, trailing timers included." -m "This commit also carries the previously-uncommitted local work in these two files: bridge liveness ping/pong, iframe remount when the preview escapes to an OAuth host, and normalizeSandboxPathname/isSamePreviewOrigin in sandbox-url.ts. The two files must land together or the import breaks."

git push origin codex/security-hardening
echo ===== done, HEAD is =====
git log --oneline -3
pause
