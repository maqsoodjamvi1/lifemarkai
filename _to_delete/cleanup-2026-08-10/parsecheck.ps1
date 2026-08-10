# Parse-check the scripts that must work when they are needed.
#
# An emergency rollback script with a syntax error is worse than no script: you find
# out during the emergency, and the symptom is a COMPLETELY EMPTY log file, because a
# parse failure means nothing executes - not even the first line that opens the log.
# That exact failure cost half an hour earlier today ("$branch:" parsed as a scoped
# variable reference), so these get checked ahead of time rather than on first use.
#
# ParseFile only parses. It does not run anything, so this is safe to run on a
# destructive script.

$out = "D:\Projects\lifemarkai\parsecheck-result.txt"
$rows = @("parsecheck at " + (Get-Date -Format o), "")

foreach ($f in @(
  "D:\Projects\lifemarkai\rollback-master.ps1",
  "D:\Projects\lifemarkai\upload-final.ps1",
  "D:\Projects\lifemarkai\clean-tree.ps1",
  "D:\Projects\lifemarkai\finish.ps1",
  "D:\Projects\lifemarkai\ship-all.ps1",
  "D:\Projects\lifemarkai\setup-mobile.ps1"
)) {
  if (-not (Test-Path $f)) { $rows += ("SKIP (absent)  " + $f); continue }
  $errs = $null
  try {
    [void][System.Management.Automation.Language.Parser]::ParseFile($f, [ref]$null, [ref]$errs)
    if ($errs -and $errs.Count -gt 0) {
      $rows += ("PARSE FAIL (" + $errs.Count + ")  " + $f)
      foreach ($e in $errs) { $rows += ("     line " + $e.Extent.StartLineNumber + ": " + $e.Message) }
    } else {
      $rows += ("parses OK      " + $f)
    }
  } catch {
    $rows += ("parser threw   " + $f + " :: " + $_.Exception.Message)
  }
}

$rows += ""
$rows += "Reminder: parsing clean is not the same as working. It only rules out the"
$rows += "silent-empty-log failure mode; the logic still has to be right."

$rows | Out-File $out -Encoding ascii
