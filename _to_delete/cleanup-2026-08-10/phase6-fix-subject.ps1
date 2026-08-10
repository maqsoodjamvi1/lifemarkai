# Amend 2d7b191 to strip the UTF-8 BOM PowerShell prepended to the subject.
# Out-File -Encoding utf8 on PS 5.1 emits a BOM; git kept those bytes, so the
# log reads "???feat(mcp): ...". WriteAllText with a no-BOM encoding avoids it.
$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase6-fix-subject-result.txt"
"=== FIX SUBJECT $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }

# take the existing message, drop any leading BOM/replacement chars
$existing = git log -1 --pretty=%B
$clean = ($existing -join "`n") -replace "^[\uFEFF\uFFFD\?]+", ""

$msgFile = "D:\Projects\lifemarkai\.git\PHASE6_MSG2.txt"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($msgFile, $clean, $utf8NoBom)

git commit --amend -F $msgFile 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $msgFile -Force -ErrorAction SilentlyContinue

git push origin $branch --force-with-lease 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log "--- HEAD (subject must start with 'feat') ---"
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
