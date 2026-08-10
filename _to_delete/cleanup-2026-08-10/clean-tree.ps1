# Make the working tree clean so pushes are trivial and nothing scratch can ride
# along in a commit again.
#
# THREE DISTINCT PROBLEMS, three different fixes - they are not interchangeable:
#
#  1. 40 untracked one-shot scripts and transcripts in the repo root. Fixed by
#     .gitignore patterns (prefix-based, so future batches are covered too). They
#     STAY ON DISK - they are the record of what was run today.
#
#  2. Three junk files that got COMMITTED in merge e4fb9f9: tmp-lovable-editor-dump.html
#     (388K of someone else's DOM), tmp-lovable-structure.md, and an empty
#     __rmtest__.txt. .gitignore does NOT retroactively untrack anything, so these
#     need `git rm --cached` - which removes them from the repo while leaving the
#     local copies alone.
#
#  3. scripts/apply-migration-157.js is untracked but is NOT scratch: it is real
#     tooling matching apply-migration-090..095.js, all of which are tracked. It
#     records how migration 157 was applied. That one gets COMMITTED.
#
# Note the asymmetry in 1 vs 3: both are new .js/.ps1 files created today, and the
# difference is reusability. A script that hardcodes one commit message is a
# transcript; a script that applies a named migration is tooling.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\clean-tree-result.txt"
"=== CLEAN TREE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

# --- 2. untrack the committed junk (keep local copies) ----------------------
Log ""
Log "Untracking committed junk (--cached keeps the files on disk):"
foreach ($f in @(
  "tmp-lovable-editor-dump.html",
  "tmp-lovable-structure.md",
  "migration/tanstack-start-app/src/__rmtest__.txt"
)) {
  git rm --cached --quiet -- $f 2>&1 | Out-File $log -Append -Encoding ascii
  if (Test-Path $f) { Log ("  untracked, still on disk: " + $f) }
  else { Log ("  WARNING - file vanished from disk: " + $f) }
}

# --- 3. commit the real tooling + the ignore rules ---------------------------
Log ""
Log "Staging .gitignore and the migration script:"
git add -- ".gitignore" "scripts/apply-migration-157.js" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
chore: stop scratch scripts leaking into the repo, untrack committed dumps

Three separate problems, deliberately fixed three different ways.

1. FORTY UNTRACKED SCRATCH FILES IN THE ROOT.
Each session added one-shot scripts and their transcripts (ship-*.ps1, phase*.ps1,
*-result.txt and so on), and .gitignore only listed the specific prefixes that
existed when it was last edited. So the pile grew every session and every `git
status` was 40 lines of noise - which is not merely untidy: `git stash` during
today's merge could not remove those untracked files (the mount rejects the
unlink), so `git stash pop` afterwards refused with "already exists, no checkout"
and left a phantom stash entry that looked like lost work.

The new patterns are PREFIX-based rather than per-batch, so the next set of
one-shot scripts is covered without editing this file again. The files stay on
disk - they are the record of what was actually run.

The four reusable helpers (setup-mobile.ps1, start-dev.ps1, run-dev.bat,
migrate.bat) stay tracked, with explicit negations documenting that intent in case
someone broadens a pattern later.

2. THREE JUNK FILES THAT WERE ACTUALLY COMMITTED, in merge e4fb9f9:
tmp-lovable-editor-dump.html (388K of a third party's rendered markup, captured as
reference material while matching their editor layout), tmp-lovable-structure.md,
and an empty __rmtest__.txt left over from a delete test. Nothing in the app reads
any of them - verified by grep across src, scripts and docs before removing.

.gitignore does not retroactively untrack anything, so these needed `git rm
--cached`: removed from the repo, local copies untouched.

3. scripts/apply-migration-157.js IS NOT SCRATCH, and is committed here.
It sits alongside apply-migration-090..095.js, all of which are tracked, and it
records how migration 157 reached the live database - including the verification
step that checks all six created objects actually exist rather than assuming the
apply succeeded.

The line between 1 and 3 is reusability, not file type: both are files written in
the same session. A script that hardcodes a single commit message is a transcript;
a script that applies a named migration and verifies the result is tooling.
'@

$f = "D:\Projects\lifemarkai\.git\CLEAN_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii

# --- verify: is the tree actually clean now? --------------------------------
Log ""
Log "--- VERIFICATION ---"
$remaining = (git status --porcelain | Out-String).Trim()
if ($remaining.Length -eq 0) {
  Log "git status is CLEAN - nothing untracked, nothing modified."
} else {
  Log "Still reported by git status:"
  $remaining | Out-File $log -Append -Encoding ascii
  Log "(anything listed here is NOT covered by the new ignore rules - check it)"
}

Log ""
Log "local  HEAD   = " + (git rev-parse HEAD).Trim()
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ("remote " + $branch + " = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
