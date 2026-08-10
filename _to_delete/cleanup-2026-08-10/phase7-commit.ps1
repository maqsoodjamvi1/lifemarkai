# Batch 2 - unlock unreachable editor UI. Message via -F, UTF8 no BOM.
$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase7-result.txt"
"=== BATCH 2 $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }
$e = "migration/tanstack-start-app/src/components/editor"

git add -- `
  "$e/chat-panel.tsx" `
  "$e/preview-panel.tsx" `
  "$e/lovable/composer-toolbar.tsx" `
  "$e/lovable/composer-bottom-row.tsx" `
  "$e/lovable/composer-input-area.tsx" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(editor): unlock UI that was built but unreachable

Five features shipped in the editor that a user could not actually reach. None of
this is new functionality - it is reconnecting work that was already paid for.

1. MODEL PICKER AND MULTI-AGENT WERE BEHIND A CLOSED LOOP.
composer-bottom-row rendered the model menu only when
`multiAgent || modelManuallySelectedRef.current`, and the ONLY controls that set
either flag lived inside that same menu. Nothing else in the app ever called
onMultiAgentChange, so neither the model picker nor multi-agent could be opened at
all - selectedModel stayed on DEFAULT_CODING_MODEL and every request sent
modelManuallySelected: false. Added the missing entry point: a "Model &
multi-agent" item in the + menu, threaded chat-panel -> input-area -> bottom-row
as showModelMenu/onToggleModelMenu, mirroring the existing file-gen picker.

2. TYPED FOLLOW-UPS NEVER REACHED THE RICH QUEUE.
handleSend had an early return that pushed typed text into the simple
`queuedMessages` string array. It ran BEFORE the rich-queue branch, so promptQueue
only ever received image-only sends. Consequence: the whole LovablePromptQueue UI
(reorder, inline edit, repeat-N, pause, clear) never saw a typed message, the
header queue pill read 0 while items were pending, and the pause control acted on
a queue that held nothing. Removed the short-circuit so every queued send flows
through the rich queue, which is drained by an effect already guarded on
sendingRef, credits, paused state and per-item repeats, and which calls
sendMessage directly so there is no re-queue path.

3. THREAD COLLAPSE WAS A NO-OP. `collapsed` was pinned to false, leaving the
"Collapse all threads" menu item, the onToggleCollapse handler and the
sessionStorage persistence all writing state nothing read. Now honours
collapsedThreads, and never collapses the newest thread so the current turn stays
readable.

4. PREVIEW AUTO-HEAL WAS SILENTLY OFF. usePreviewErrorGuard was constructed
without autoHeal, whose default is false, so the documented self-healing loop only
ever ran when the user clicked "Try to fix". Enabled; the loop is already bounded
by MAX_AUTO_FIX_ATTEMPTS (3), after which the recovery banner takes over, so it
cannot spin.

5. TWO PROPS WERE DROPPED IN TRANSIT. fileGenBinaryEnabled/fileGenBinaryReason
were passed by chat-panel but never forwarded by composer-input-area, so the
binary file-gen capability gate always fell back to its defaults and was inert.
queueDisabledReason was hardcoded undefined, so the send-control tooltip could
never say why queueing was unavailable - it now reports out-of-credits, Live-mode
lock, or empty input.

Verified: all five touched files parse via the TypeScript compiler API, and ten
assertions confirm each loop is open - the + menu entry exists, the render gate
accepts the new flag, chat-panel owns the state, input-area forwards it, the
simple-queue short-circuit is gone while the rich branch remains, and none of the
four dead switches still hold their old hardcoded value.
'@

$f = "D:\Projects\lifemarkai\.git\PHASE7_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
