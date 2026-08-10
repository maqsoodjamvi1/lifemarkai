$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase9-result.txt"
"=== NUL FIX $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }

git add -- "migration/tanstack-start-app/src/lib/ai/agent.ts" 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(agent): remove the NUL byte that made agent.ts a binary file to git

Noticed while committing batch 3: git reported "agent.ts | Bin 31435 -> 32312
bytes". A source file was being tracked as BINARY.

Cause: globToRegExp used a literal NUL (0x00) as the sentinel holding `**` aside
while `*` was converted. Two of them, at the substitute and the restore. The code
worked - but a single 0x00 anywhere in a file makes git classify the whole file as
binary, and this file holds the entire agent loop. Consequences: no diffs in
review, no git blame, no mergeability (conflicts surface as "binary files differ"
and must be resolved by hand), and grep/ripgrep skip it unless forced. That last
one bit me earlier in this session - a grep for runAgent's options came back
"binary file matches" instead of the lines.

Replaced with a plain ASCII sentinel (__LM_GLOBSTAR__) and switched the restore
from .replace(/\x00/g, ".*") to .split(SENTINEL).join(".*"), which also avoids
having to think about regex-escaping the sentinel.

Proved equivalence rather than assuming it: ran the old NUL implementation and the
new one over 9 glob patterns x 10 paths = 90 comparisons, asserting both the
generated RegExp source strings and the match results are identical. They are.
agent.ts parses and now contains 0 NUL bytes, so git treats it as text again and
future changes to the agent loop will be reviewable.
'@

$f = "D:\Projects\lifemarkai\.git\PHASE9_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log "--- is agent.ts text now? (a real diffstat means yes) ---"
git show --stat HEAD -- migration/tanstack-start-app/src/lib/ai/agent.ts 2>&1 | Select-Object -Last 4 | Out-File $log -Append -Encoding ascii
git log --oneline -2 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
