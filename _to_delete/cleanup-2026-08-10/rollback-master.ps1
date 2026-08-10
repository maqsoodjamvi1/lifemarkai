# EMERGENCY ROLLBACK: put master back to what it was before today's two merges.
#
# ONLY run this if the Coolify deploy breaks lifemarkai.com. Not needed otherwise.
#
# UPDATED 17:15 - there are now TWO merges on master, not one:
#     797e741  merge: untrack committed dumps, positional ignore rule   (17:12)
#     e4fb9f9  merge: Lovable-gap closure, 180 connectors, truthfulness (16:34)
#     b53e629  <- what master was before either of them
# Reverting only e4fb9f9 would leave 797e741 on top of a tree it was never built
# against, so both are reverted, NEWEST FIRST. Order matters: reverting the older
# merge first would conflict against changes the newer one still references.
#
# WHY REVERT AND NOT RESET: a revert adds new commits and leaves history intact, so
# it is safe for anyone who already pulled, and it can itself be reverted to bring
# the work back. `git reset --hard` + force-push to master would destroy both merges
# for every other clone - never the right tool on a shared branch.
#
# MIGRATION 157 IS DELIBERATELY NOT ROLLED BACK. It only ADDS two tables and four
# columns; the older code simply never queries them. Dropping them would be the risky
# act, not keeping them - and if you redeploy later they are already in place.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\rollback-result.txt"
"=== ROLLBACK MASTER $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

# Newest first.
$MERGES = @(
  "797e741b4c360c66cb38d00efdb14d0e87d71f64",
  "e4fb9f947875229d6286a62f32ba6133e4570f40"
)
$EXPECTED_HEAD = $MERGES[0]
$BEFORE_ALL    = "b53e629d4e6473dfb2725e7d6639463e6b661750"

$startBranch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "starting branch = $startBranch"

# Refuse if master has moved on - otherwise this reverts the wrong thing, or reverts
# on top of someone else's work.
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
$remoteMaster = (git rev-parse origin/master).Trim()
Log "origin/master   = $remoteMaster"
if ($remoteMaster -ne $EXPECTED_HEAD) {
  Log "origin/master is NOT at the expected merge commit ($EXPECTED_HEAD)."
  Log "Something has landed since this script was written. STOPPING - reverting"
  Log "blindly could undo work that is not mine to undo."
  Log "DONE"; exit 1
}

$dirty = (git status --porcelain | Out-String).Trim()
if ($dirty.Length -gt 0) {
  Log "Working tree is not clean. STOPPING rather than stashing - a stash during"
  Log "today's merge failed to pop and left a phantom entry. Commit or ignore first:"
  $dirty | Out-File $log -Append -Encoding ascii
  Log "DONE"; exit 1
}

git checkout master 2>&1 | Out-File $log -Append -Encoding ascii
if ((git rev-parse --abbrev-ref HEAD).Trim() -ne "master") {
  Log "checkout master failed. STOPPING."; Log "DONE"; exit 1
}
git pull --ff-only origin master 2>&1 | Out-File $log -Append -Encoding ascii

# Revert each merge. -m 1 means "relative to the first parent", i.e. drop everything
# the feature branch brought in. Without -m, git refuses to revert a merge at all.
foreach ($m in $MERGES) {
  $before = (git rev-parse HEAD).Trim()
  Log ""
  Log ("reverting merge " + $m.Substring(0,8) + " ...")
  git revert --no-edit -m 1 $m 2>&1 | Out-File $log -Append -Encoding ascii
  $after = (git rev-parse HEAD).Trim()
  if ($before -eq $after) {
    Log "  no commit produced - conflict. NOTHING HAS BEEN PUSHED."
    git status 2>&1 | Out-File $log -Append -Encoding ascii
    Log "  Resolve, then: git revert --continue"
    Log "  Then re-run this script, or push manually once both reverts are in."
    Log "DONE"; exit 1
  }
  Log ("  -> " + $after.Substring(0,8))
}

# The end state must match the pre-merge tree exactly, or this did not do what it
# claims. Compare TREES, not commit ids: the commits differ by construction.
$treeNow    = (git rev-parse "HEAD^{tree}").Trim()
$treeBefore = (git rev-parse "$BEFORE_ALL^{tree}").Trim()
Log ""
Log "tree after reverts = $treeNow"
Log "tree at b53e629    = $treeBefore"
if ($treeNow -ne $treeBefore) {
  Log ""
  Log "TREES DO NOT MATCH. Not pushing."
  Log "That can be legitimate if other commits landed on master in between, but it"
  Log "must be looked at rather than trusted. Inspect with:"
  Log "  git diff $BEFORE_ALL HEAD --stat"
  # Single-quoted: backtick is PowerShell's ESCAPE character, so wrapping a command
  # in backticks inside a double-quoted string mangles it and breaks the parse.
  Log '  The reverts are committed LOCALLY only. To discard them: git reset --hard origin/master'
  Log "discards them if you decide against this."
  Log "DONE"; exit 1
}
Log "trees match - the rollback reproduces the pre-merge state exactly."

git push origin master 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
$nowRemote = (git rev-parse origin/master).Trim()
Log ""
Log "remote master now = $nowRemote"
if ($nowRemote -ne (git rev-parse HEAD).Trim()) {
  Log "PUSH DID NOT LAND. Local reverts exist but the remote is unchanged."
  Log "DONE"; exit 1
}

git checkout $startBranch 2>&1 | Out-File $log -Append -Encoding ascii

Log ""
Log "======================================================================"
Log "ROLLBACK PUSHED - Coolify will rebuild the pre-merge code"
Log "======================================================================"
Log "codex/security-hardening is untouched: nothing is lost. To bring the work"
# Single-quoted: a bare < inside a double-quoted string is a PowerShell parse error
# ("the '<' operator is reserved for future use"), and it takes the whole file down.
Log 'back later, revert the reverts (git revert THE-TWO-NEW-COMMITS) or merge'
Log "the branch again once the deploy problem is understood."
git log --oneline -5 origin/master 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
