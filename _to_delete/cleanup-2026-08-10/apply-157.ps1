# Apply + verify migration 157 on live Supabase.
#
# Wrapped in a .ps1 rather than passed via `powershell -Command` because the Run
# dialog mangles nested quotes around the redirect operator. -File takes the path
# and nothing needs escaping.
#
# The credential is read from .env.local by the node script; it is never passed on
# a command line (command lines are visible to other processes and land in history).

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\migration-157-result.txt"
"=== MIGRATION 157 $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

# node must be resolvable; if it is not, say so plainly instead of writing an
# empty log that looks like a silent success.
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) {
  Log "node not found on PATH. Cannot apply the migration."
  Log "DONE"
  exit 1
}
Log ("node: " + $node.Source)
Log ("version: " + (& node --version))
Log ""

& node "scripts\apply-migration-157.js" 2>&1 | Out-File $log -Append -Encoding ascii
$code = $LASTEXITCODE

Log ""
if ($code -eq 0) {
  Log "EXIT 0 - migration applied and all six objects verified present."
} else {
  Log "EXIT $code - migration did NOT fully succeed. Do not merge to master yet."
}
Log "DONE"
exit $code
