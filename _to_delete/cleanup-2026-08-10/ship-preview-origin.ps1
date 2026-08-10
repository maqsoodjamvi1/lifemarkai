# Ship the preview postMessage sender check.
#
# ONE FILE, no lockfile changes. The root package-lock.json fix (ad6aa98) has not
# been validated by a green build yet, so nothing touches dependencies here - a
# second lockfile change now would make a failed build ambiguous between two causes.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-preview-origin-result.txt"
"=== SHIP PREVIEW ORIGIN $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

$s = "migration/tanstack-start-app/src"
git add -- "$s/components/editor/preview-panel.tsx" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(preview): only the preview iframe may drive the preview panel

The postMessage handler accepted messages from ANY window. The comment above it
justified that: the srcdoc iframe had an opaque ("null") origin, so the sender
could not be identified and only the message SHAPE was validated.

That justification is stale. The srcdoc engine was retired in the Modal-only
refactor - every `srcDoc` mention left in this file is a comment, and all three
live iframes are remote `src=` URLs (Modal sandbox, WebContainer, deployed URL).
The sender has been identifiable for a while; nothing was updated to use it.

Why it matters: the previewed app is USER-GENERATED CODE, and it can post to its
parent. Shape validation stops crashes, not lies. A hostile or prompt-injected
app could fabricate console lines - which this handler forwards to
/api/projects/:id/preview-telemetry - or forge `lifemark-veb` element selections
so that a visual edit lands on a selector of its choosing rather than the one the
user clicked.

Compares `e.source` against the live contentWindow instead of parsing origin
strings. A window reference is identity rather than a claim, so it cannot be
spoofed, needs no URL bookkeeping, and survives redirects and engine switches.
getPreviewContentWindow already resolves the right iframe per engine and is
already in this effect's dependency array, so the guard never holds a stale
window.

Deliberately fails OPEN when no preview window exists yet (`expected` null): at
that point there is no legitimate sender either, and failing closed would drop
the `lifemark-veb-ready` handshake if it raced the ref assignment - which would
silently disable visual editing. Shape validation is unchanged and still runs on
everything, because a compromised preview is an untrusted sender even when it is
the right window.

Found by an audit of the chat and preview panels: 40/40 API calls resolve to real
routes, 214 buttons and every anchor have handlers, no dead links, no no-op
handlers. This was the only real defect.
'@

$f = "D:\Projects\lifemarkai\.git\PREVIEW_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii

Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
