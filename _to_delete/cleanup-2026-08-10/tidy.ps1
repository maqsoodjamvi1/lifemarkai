# Drop the redundant stash left behind by finish.ps1.
#
# SAFE because every one of the 39 files in it was verified present on disk first.
# The pop failed only because `git stash push -u` could not actually REMOVE the
# untracked files (the Cowork mount returns "Invalid argument" on unlink), so they
# were never taken away - pop then refused with "already exists, no checkout".
# The stash is therefore a duplicate copy, not the only copy.
#
# stash@{0} must be QUOTED: unquoted, PowerShell reads @{ as the start of a hashtable
# literal.

$out = "D:\Projects\lifemarkai\ping.txt"
$rows = @()
$rows += "tidy ran at " + (Get-Date -Format o)

Set-Location "D:\Projects\lifemarkai"

$rows += ""
$rows += "--- stashes before ---"
$rows += (git --no-optional-locks stash list | Out-String).Trim()

git stash drop 'stash@{0}' 2>&1 | ForEach-Object { $rows += ("drop: " + $_) }

$rows += ""
$rows += "--- stashes after ---"
$after = (git --no-optional-locks stash list | Out-String).Trim()
if ($after.Length -eq 0) { $rows += "(none)" } else { $rows += $after }

# Confirm the helper scripts are still on disk after the drop - a stash drop should
# never touch the working tree, but the whole point of this session was verifying
# rather than assuming.
$rows += ""
$rows += "--- working tree still intact? ---"
foreach ($f in @("ship-all.ps1","finish.ps1","scripts\apply-migration-157.js","setup-mobile.ps1")) {
  if (Test-Path $f) { $rows += ("PRESENT  " + $f) } else { $rows += ("MISSING  " + $f) }
}

$rows += ""
$rows += "--- branch ---"
$rows += (git --no-optional-locks rev-parse --abbrev-ref HEAD)

$rows | Out-File $out -Encoding ascii
