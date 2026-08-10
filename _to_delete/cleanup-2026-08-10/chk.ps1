# Diagnostic: does finish.ps1 parse, and what does Windows see in the files I wrote?
# A parse error explains a script producing NO log at all: nothing runs, not even
# line 1, so the absence of output is itself the clue.
$out = "D:\Projects\lifemarkai\ping.txt"
$rows = @()
$rows += "chk ran at " + (Get-Date -Format o)

foreach ($f in @(
  "D:\Projects\lifemarkai\finish.ps1",
  "D:\Projects\lifemarkai\r.bat",
  "D:\Projects\lifemarkai\apply-157.ps1",
  "D:\Projects\lifemarkai\ship-all.ps1",
  "D:\Projects\lifemarkai\scripts\apply-migration-157.js"
)) {
  if (Test-Path $f) {
    $len = (Get-Item $f).Length
    $rows += ("EXISTS len=" + $len + "  " + $f)
  } else {
    $rows += ("MISSING              " + $f)
  }
}

$rows += ""
$rows += "--- parse check: finish.ps1 ---"
$errs = $null
try {
  [void][System.Management.Automation.Language.Parser]::ParseFile(
    "D:\Projects\lifemarkai\finish.ps1", [ref]$null, [ref]$errs)
  if ($errs -and $errs.Count -gt 0) {
    $rows += ("PARSE ERRORS: " + $errs.Count)
    foreach ($e in $errs) { $rows += ("  line " + $e.Extent.StartLineNumber + ": " + $e.Message) }
  } else {
    $rows += "parses clean - the problem is not syntax"
  }
} catch {
  $rows += ("parser threw: " + $_.Exception.Message)
}

$rows += ""
$rows += "--- node present? ---"
$n = Get-Command node -ErrorAction SilentlyContinue
if ($n) { $rows += ("node at " + $n.Source) } else { $rows += "node NOT on PATH" }

$rows | Out-File $out -Encoding ascii
