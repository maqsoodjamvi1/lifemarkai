# Last step: move the stray one-shot script out of scripts/ and commit the unanchored
# transcript rule. Lives at the ROOT because the root is the scratch zone - this file
# is ignored by the very rule it is finishing, which is correct, not a problem.
#
# scripts/ is for TRACKED tooling (apply-migration-*.js and friends). Putting a
# one-shot script there made it untracked noise in a directory that is supposed to be
# clean. Moving it to the root - where it is auto-ignored - is the fix.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\seal-tree-result.txt"
"=== SEAL TREE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

# Move, don't delete: these are the record of what ran. At the root they are ignored.
Log ""
foreach ($n in @("finalise-tree.ps1", "finalise-tree-result.txt")) {
  $src = "scripts\$n"
  if (Test-Path $src) {
    Move-Item -Force $src ".\$n"
    Log ("moved to root (now ignored): " + $n)
  } else {
    Log ("not present, nothing to move: " + $src)
  }
}

git add -- ".gitignore" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
chore: ignore transcripts anywhere, not just at the repo root

Completes the previous commit. That one anchored every scratch pattern to the repo
root, which immediately produced the mistake it was meant to prevent: a one-shot
script was placed in scripts/ specifically "to keep it out of the ignore rule", and
it plus its transcript became untracked noise in the one directory that is supposed
to hold only tracked tooling.

The reasoning error is worth naming, because it is easy to repeat: being git-ignored
does not stop a file from running. An ignored file sits on disk and executes
normally. Ignoring is precisely what a one-shot script wants.

So *-result.txt and *-console.txt are now unanchored - a transcript is never source
no matter where it lands - and the stray script moved back to the root, where the
positional rule already covers it. scripts/ holds tracked tooling only.
'@

$f = "D:\Projects\lifemarkai\.git\SEAL_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii

Log ""
Log "--- FINAL VERIFICATION ---"
$remaining = (git status --porcelain | Out-String).Trim()
if ($remaining.Length -eq 0) {
  Log "git status is CLEAN. The tree is ready to push at any time with no surprises."
} else {
  Log "Still reported:"
  $remaining | Out-File $log -Append -Encoding ascii
}

# The keepers must still be visible to git, and scripts/ must still hold its tooling.
Log ""
Log "--- sanity: nothing important got hidden ---"
foreach ($f in @("setup-mobile.ps1","start-dev.ps1","run-dev.bat","migrate.bat",
                 "scripts/apply-migration-157.js","scripts/apply-migration-095.js")) {
  $t = (git ls-files -- $f | Out-String).Trim()
  if ($t.Length -gt 0) { Log ("  tracked  " + $f) } else { Log ("  NOT TRACKED  " + $f) }
}

git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
