# ASCII-only variant of remove-nextjs.ps1 (the original contains em-dashes,
# which PowerShell 5 misreads in BOM-less UTF-8 as stray smart-quotes and
# fails to parse). Applies immediately: tag, git rm, commit, push.
$ErrorActionPreference = "Stop"
Set-Location "D:\Projects\lifemarkai"

$branch = git rev-parse --abbrev-ref HEAD
Write-Output "Branch: $branch"
if ($branch -eq "master") {
  Write-Output "REFUSING: on master (production rollback branch)."
  exit 1
}

$targets = @("app", "components", "hooks", "store", "next-env.d.ts")

git tag -f pre-nextjs-removal
Write-Output "Tagged HEAD as pre-nextjs-removal"

foreach ($t in $targets) {
  if (Test-Path $t) {
    git rm -r -q $t
    Write-Output "removed $t"
  } else {
    Write-Output "absent  $t"
  }
}

Write-Output "===== status (first 20) ====="
git status --short | Select-Object -First 20
Write-Output "===== commit ====="
git commit -m "chore: remove Next.js app; TanStack Start is the only app"
Write-Output "===== push ====="
git push origin $branch
git push -f origin pre-nextjs-removal
Write-Output "===== HEAD ====="
git log --oneline -2
