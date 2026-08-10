# Finish the working-tree cleanup: commit the generalised ignore rule and prove the
# tree is clean.
#
# Lives in scripts/ rather than the repo root ON PURPOSE - the new ignore rule makes
# root-level .ps1 files invisible to git, so a cleanup script sitting in the root
# would be ignored by the very rule it is committing. scripts/ is where tracked
# tooling belongs.
#
# WHY THE RULE CHANGED SHAPE: the previous attempt listed name prefixes (push-*,
# phase*, ship-*). That failed three times in one session because each new batch
# invented a new name - and the final escapee was clean-tree.ps1, the script that
# was cleaning up the mess. Position is stable where names are not: anything at the
# repo root that is a .ps1/.bat/-result.txt is scratch unless explicitly named.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\scripts\finalise-tree-result.txt"
"=== FINALISE TREE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

# Confirm the four keepers are still tracked BEFORE committing a rule that could
# hide them. .gitignore cannot untrack anything, but verifying beats trusting.
Log ""
Log "Keepers still tracked?"
foreach ($f in @("setup-mobile.ps1","start-dev.ps1","run-dev.bat","migrate.bat")) {
  $tracked = (git ls-files -- $f | Out-String).Trim()
  if ($tracked.Length -gt 0) { Log ("  tracked   " + $f) } else { Log ("  NOT TRACKED  " + $f) }
}

git add -- ".gitignore" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
chore: make the scratch-file ignore rule positional instead of name-based

The previous rule listed name prefixes - push-*, phase3-*, then phase*, ship-*,
finish, apply-1*, rollback-*, tidy, chk. It failed three times in a single session,
because every batch of work invents a new script name. The last escapee was
clean-tree.ps1: the script written to clean up the untracked-file mess was itself
left untracked by the pattern list committed alongside it.

Names are unstable; position is not. Anything at the REPO ROOT matching *.ps1,
*.bat, *-result.txt, *-console.txt or ping.txt is now ignored by default, with the
four genuinely reusable helpers named as exceptions (setup-mobile.ps1,
start-dev.ps1, run-dev.bat, migrate.bat). The patterns are anchored with a leading
slash, so real tooling under scripts/ is untouched - apply-migration-*.js and the
rest keep behaving normally.

Why this matters beyond tidiness: 40 untracked files in the root is what entangled
`git stash` during the master merge earlier today. The stash could not remove them
(the mount rejects the unlink), so `stash pop` refused with "already exists, no
checkout" and left a phantom stash entry that read like lost work. A clean root
means the next merge does not have that failure mode available to it.
'@

$f = "D:\Projects\lifemarkai\.git\FINALISE_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii

Log ""
Log "--- VERIFICATION: is the tree finally clean? ---"
$remaining = (git status --porcelain | Out-String).Trim()
if ($remaining.Length -eq 0) {
  Log "git status is CLEAN. Nothing untracked, nothing modified."
} else {
  Log "Still reported:"
  $remaining | Out-File $log -Append -Encoding ascii
}

Log ""
Log "--- the 40 scratch files are ignored, not deleted ---"
foreach ($f in @("ship-all.ps1","finish.ps1","clean-tree.ps1","ping.txt")) {
  if (Test-Path $f) { Log ("  on disk (ignored): " + $f) } else { Log ("  gone: " + $f) }
}

git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
