# Run the whole pending ship sequence, in order, stopping the moment one fails.
#
# WHY THIS EXISTS. There are five commit scripts and they are NOT independent: each
# stages a specific file list, and those files were edited in sequence, so a skipped
# or reordered step produces a commit whose message describes work that is not in it.
# None of the individual scripts checks whether the previous one landed either - they
# pipe git output to a log and carry on regardless.
#
# This orchestrator verifies HEAD actually moved after each step before starting the
# next. That is the only reliable signal: the scripts do not set exit codes.
#
# Safe to re-run. A script whose commit already landed leaves nothing staged, HEAD
# does not move, and this stops with "nothing to commit" rather than pretending.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-all-result.txt"
"=== SHIP ALL $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }

# Order matters. Do not reshuffle without re-reading what each one stages.
$steps = @(
  @{ name = "ship-xmlfix.ps1";            what = "file_update XML mismatch + delete_file/patch ambiguity" },
  @{ name = "ship-gapclose.ps1";          what = "orchestrator auto-route, allowlist, filenames, diagnosis" },
  @{ name = "ship-connectors-models.ps1"; what = "connectors 52 to 83 + model refresh" },
  @{ name = "ship-truthfulness.ps1";      what = "five truthfulness fixes" },
  @{ name = "ship-gap8-batch1.ps1";       what = "gap-8 items 2, 3, 8, 10, 13, 16" }
)

$completed = 0
foreach ($step in $steps) {
  $script = Join-Path "D:\Projects\lifemarkai" $step.name

  Log ""
  Log "======================================================================"
  Log "STEP $($completed + 1)/$($steps.Count): $($step.name)"
  Log "  $($step.what)"
  Log "======================================================================"

  if (-not (Test-Path $script)) {
    Log "MISSING: $script"
    Log "STOPPING. Do not run later steps without this one."
    exit 1
  }

  $before = (git rev-parse HEAD).Trim()

  & powershell -NoProfile -ExecutionPolicy Bypass -File $script 2>&1 |
    Out-File $log -Append -Encoding ascii

  $after = (git rev-parse HEAD).Trim()

  if ($before -eq $after) {
    Log ""
    Log "HEAD did not move after $($step.name) - the commit did not happen."
    Log "Check its own result file for the reason:"
    Log "  $($step.name.Replace('.ps1','-result.txt'))"
    Log ""
    Log "STOPPING after $completed of $($steps.Count) steps. Later steps stage files"
    Log "that assume this commit exists, so continuing would produce commits whose"
    Log "messages do not match their contents."
    exit 1
  }

  $completed++
  Log "OK - $($after.Substring(0,8)) committed and pushed."
}

Log ""
Log "======================================================================"
Log "ALL $completed STEPS LANDED"
Log "======================================================================"
git log --oneline -6 2>&1 | Out-File $log -Append -Encoding ascii

$dirty = git status --porcelain 2>&1 | Out-String
if ($dirty.Trim().Length -gt 0) {
  Log ""
  Log "NOTE: the working tree still has uncommitted changes. That is expected -"
  Log "the ship scripts stage explicit file lists, not everything. Review with:"
  Log "  git status"
}

Log ""
Log "======================================================================"
Log "REMAINING MANUAL STEP - NOT DONE BY THIS SCRIPT"
Log "======================================================================"
Log ""
Log "Migration 157 must be applied to live Supabase, or five of the features you"
Log "just pushed will fail at runtime against tables that do not exist:"
Log ""
Log "  supabase/migrations/157_cve_suppressions_and_settings.sql"
Log ""
Log "It creates dependency_cve_suppressions and project_publish_grants, and adds"
Log "profiles.allow_code_download, projects.publish_audience, and the api_keys"
Log "revoked_at/revoked_reason columns."
Log ""
Log "Apply it via the Supabase SQL editor, or:  supabase db push"
Log ""
Log "Affected if you skip it:"
Log "  - /api/security/dependencies  (suppression read/write)"
Log "  - /api/security/leaked-key    (revoked_at write)"
Log "  - /api/projects/:id/export    (allow_code_download read)"
Log "  - publish audience control    (tables absent; route not written yet)"
Log ""
Log "AFTER THAT, the one thing still unproven: open a project on lifemarkai.com and"
Log "send a genuinely multi-part build prompt to confirm the orchestrator auto-route"
Log "hands off end-to-end. It is verified by 82 assertions but has never run live,"
Log "and the handoff crosses the browser."
Log "DONE"
