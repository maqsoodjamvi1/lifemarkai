# Finish the release: apply migration 157, verify it, and ONLY THEN merge to master.
#
# WHY THE GATE IS IN THIS SCRIPT rather than in the order I run two commands:
# driving the Run dialog turned out to corrupt long command lines (a pasted path
# came through as "D:\Projects\lifekai\..." with characters dropped). So the fewer
# characters that have to be typed, the safer. One short invocation, and the
# ordering constraint is enforced by code that cannot be mistyped.
#
# THE CONSTRAINT: the pushed code queries tables migration 157 creates. Merging to
# master deploys that code to lifemarkai.com. Deploying first would put live code in
# front of tables that do not exist. So: migration must apply AND verify before the
# merge is even attempted, and a failure at any point stops everything.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\finish-result.txt"
"=== FINISH RELEASE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

# ---------------------------------------------------------------- 1. migration
Log "STEP 1/2: apply + verify migration 157"
Log "======================================"

$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { Log "node not found on PATH. Stopping."; Log "DONE"; exit 1 }

& node "scripts\apply-migration-157.js" 2>&1 | Out-File $log -Append -Encoding ascii
$mig = $LASTEXITCODE

if ($mig -ne 0) {
  Log ""
  Log "MIGRATION FAILED OR INCOMPLETE (exit $mig)."
  Log "NOT merging to master - the deployed code would query tables that do not exist."
  Log "See the migration output above for which object is missing."
  Log "DONE"
  exit 1
}
Log ""
Log "Migration 157 applied and all six objects verified."

# ---------------------------------------------------------------- 2. merge
Log ""
Log "STEP 2/2: merge to master and deploy"
Log "===================================="

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "source branch = $branch"
if ($branch -eq "master") { Log "Already on master - nothing to merge."; Log "DONE"; exit 0 }

# The feature branch must be fully pushed first. Merging a branch whose commits are
# only local would produce a master that references objects the remote lacks.
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
$localHead  = (git rev-parse HEAD).Trim()
$remoteHead = (git rev-parse "origin/$branch" 2>$null)
if ($remoteHead) { $remoteHead = $remoteHead.Trim() }
Log "local  $branch = $localHead"
Log "remote $branch = $remoteHead"
if ($localHead -ne $remoteHead) {
  Log "Local and remote $branch differ. Push the branch before merging. Stopping."
  Log "DONE"
  exit 1
}

# A dirty tree would get swept into the merge commit. The ship scripts staged
# explicit file lists, so leftovers are expected - they must NOT ride along.
$dirty = (git status --porcelain | Out-String).Trim()
if ($dirty.Length -gt 0) {
  Log ""
  Log "Working tree is dirty. Stashing before the merge so uncommitted work is not"
  Log "swept into it (it will be restored afterwards):"
  $dirty | Out-File $log -Append -Encoding ascii
  git stash push -u -m "finish.ps1 auto-stash" 2>&1 | Out-File $log -Append -Encoding ascii
  $stashed = $true
} else { $stashed = $false }

git checkout master 2>&1 | Out-File $log -Append -Encoding ascii
if ((git rev-parse --abbrev-ref HEAD).Trim() -ne "master") {
  Log "Could not check out master. Stopping."
  if ($stashed) { git stash pop 2>&1 | Out-File $log -Append -Encoding ascii }
  Log "DONE"; exit 1
}

git pull --ff-only origin master 2>&1 | Out-File $log -Append -Encoding ascii
$beforeMerge = (git rev-parse HEAD).Trim()

# ${branch} must be brace-delimited: "$branch:" makes PowerShell read $branch: as a
# SCOPED variable reference (like $env: or $global:), which is a parse error - and a
# parse error means the whole script never runs, so not even the first log line gets
# written. An empty log file is what that failure looks like from outside.
$mergeMsg = "merge " + $branch + ": Lovable-gap closure, 180 connectors, truthfulness fixes, live-tested"
git merge --no-ff $branch -m $mergeMsg 2>&1 | Out-File $log -Append -Encoding ascii

$afterMerge = (git rev-parse HEAD).Trim()
if ($beforeMerge -eq $afterMerge) {
  Log ""
  Log "MERGE DID NOT PRODUCE A COMMIT - likely a conflict. master is unchanged."
  Log "Resolve manually; nothing was pushed."
  git status 2>&1 | Out-File $log -Append -Encoding ascii
  Log "DONE"; exit 1
}
Log "merged -> $afterMerge"

git push origin master 2>&1 | Out-File $log -Append -Encoding ascii

# Confirm the remote actually moved. "git push" printing text is not proof.
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
$remoteMaster = (git rev-parse origin/master).Trim()
Log "remote master = $remoteMaster"
if ($remoteMaster -ne $afterMerge) {
  Log "PUSH DID NOT LAND - remote master does not match the merge commit."
  Log "DONE"; exit 1
}

# Return to the feature branch and restore the stash, so the working state is left
# as it was found rather than parked on master.
git checkout $branch 2>&1 | Out-File $log -Append -Encoding ascii
if ($stashed) { git stash pop 2>&1 | Out-File $log -Append -Encoding ascii }

Log ""
Log "======================================================================"
Log "RELEASE COMPLETE"
Log "======================================================================"
Log "Migration 157 verified on live Supabase."
Log "master = $remoteMaster (pushed). Coolify should now rebuild lifemarkai.com."
Log ""
Log "Watch the Coolify deploy. Once it is green, the last unproven thing is a"
Log "multi-part build prompt in the editor, to confirm the orchestrator auto-route"
Log "hands off end to end."
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
