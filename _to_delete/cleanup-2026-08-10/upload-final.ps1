# Complete the upload: get the three cleanup commits onto master as well.
#
# STATE GOING IN: codex/security-hardening = dea711e (pushed). master = e4fb9f9, which
# is the merge of the branch as it stood at 2e368f4 - so master is missing b2e7c79,
# 9f3fa91 and dea711e (the untracking of the committed dumps and the ignore-rule fix).
#
# NO STASHING THIS TIME. finish.ps1 had to stash because 40 untracked files were in
# the way, and that stash then failed to pop and left a phantom entry. The tree is
# clean now, so this script REFUSES to run if anything is uncommitted rather than
# reaching for stash again - the earlier problem was worth not recreating.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\upload-final-result.txt"
"=== UPLOAD FINAL $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "Already on master - nothing to merge."; Log "DONE"; exit 0 }

# 1. Tree must be clean. No stashing.
$dirty = (git status --porcelain | Out-String).Trim()
if ($dirty.Length -gt 0) {
  Log "Working tree is NOT clean. Stopping rather than stashing:"
  $dirty | Out-File $log -Append -Encoding ascii
  Log "Commit or ignore these first."
  Log "DONE"; exit 1
}
Log "working tree clean"

# 2. Branch must be fully pushed, or master would reference commits the remote lacks.
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
$localHead  = (git rev-parse HEAD).Trim()
$remoteHead = (git rev-parse "origin/$branch").Trim()
Log "local  $branch = $localHead"
Log "remote $branch = $remoteHead"
if ($localHead -ne $remoteHead) { Log "Branch not fully pushed. Stopping."; Log "DONE"; exit 1 }

# 3. Merge into master.
git checkout master 2>&1 | Out-File $log -Append -Encoding ascii
if ((git rev-parse --abbrev-ref HEAD).Trim() -ne "master") { Log "checkout master failed. Stopping."; Log "DONE"; exit 1 }

git pull --ff-only origin master 2>&1 | Out-File $log -Append -Encoding ascii
$before = (git rev-parse HEAD).Trim()
Log "master before = $before"

# Brace-delimited: "$branch:" would parse as a scoped variable reference and kill the
# whole script at parse time - which is how an earlier run produced a totally empty log.
$mergeMsg = "merge " + $branch + ": untrack committed dumps, positional scratch-file ignore rule"
git merge --no-ff $branch -m $mergeMsg 2>&1 | Out-File $log -Append -Encoding ascii

$after = (git rev-parse HEAD).Trim()
if ($before -eq $after) {
  Log "Merge produced no commit - conflict, or already up to date."
  git status 2>&1 | Out-File $log -Append -Encoding ascii
  git checkout $branch 2>&1 | Out-File $log -Append -Encoding ascii
  Log "DONE"; exit 1
}
Log "master after  = $after"

git push origin master 2>&1 | Out-File $log -Append -Encoding ascii

# 4. Prove the remote moved. Push printing output is not proof.
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
$remoteMaster = (git rev-parse origin/master).Trim()
Log "remote master = $remoteMaster"

git checkout $branch 2>&1 | Out-File $log -Append -Encoding ascii

Log ""
if ($remoteMaster -ne $after) {
  Log "PUSH DID NOT LAND - remote master does not match the merge commit."
  Log "DONE"; exit 1
}

# 5. Confirm the junk really is gone from master's tree, not just from the branch.
Log "--- did the dumps actually leave master? ---"
foreach ($f in @("tmp-lovable-editor-dump.html","tmp-lovable-structure.md")) {
  $inMaster = (git ls-tree -r --name-only origin/master -- $f | Out-String).Trim()
  if ($inMaster.Length -eq 0) { Log ("  gone from master: " + $f) } else { Log ("  STILL IN MASTER: " + $f) }
}
$mig = (git ls-tree -r --name-only origin/master -- "scripts/apply-migration-157.js" | Out-String).Trim()
if ($mig.Length -gt 0) { Log "  present in master: scripts/apply-migration-157.js" }
else { Log "  MISSING from master: scripts/apply-migration-157.js" }

Log ""
Log "======================================================================"
Log "UPLOAD COMPLETE - branch and master both at the latest work"
Log "======================================================================"
Log "master = $remoteMaster"
Log ""
Log "Coolify will see a new master commit. If it did not deploy e4fb9f9 earlier,"
Log "it will not deploy this one either - auto-deploy needs enabling, or press"
Log "Deploy manually."
git log --oneline -4 origin/master 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
