# Ship the six schema-mismatch fixes found by the repo-wide sweep.

$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-schema-sweep-result.txt"
"=== SHIP SCHEMA SWEEP $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch = $branch"
if ($branch -eq "master") { Log "REFUSING to run on master."; Log "DONE"; exit 1 }

$s = "migration/tanstack-start-app/src"
git add -- `
  "$s/lib/public-server.ts" `
  "$s/lib/server-fns/project-activity.ts" `
  "$s/lib/server-fns/deploy-status.ts" `
  "$s/lib/deploy/publish-from-chat.ts" `
  "$s/routes/api/account/export.ts" `
  "$s/routes/api/deploy.ts" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix(db): six queries referenced columns that do not exist

A repo-wide sweep compared every Supabase column reference in routes/ and lib/
against the LIVE information_schema: 505 files, 862 query chains, 2933 column
references. Six were wrong. None of them throws at build time, none is caught by
TypeScript, and PostgREST returns an error the callers ignore - so each one is a
feature that looks implemented and does nothing.

WORST FIRST - PUBLIC APP PAGES HAVE BEEN DEAD.
lib/public-server.ts selected `deploy_url` from projects. The column is
`deployed_url`. PostgREST rejects the whole select on an unknown column, so `data`
was null, `project` was null, and the very next line returns
`{ status: "not_found" }`. Every public project page has been returning not-found -
not a degraded fallback to preview_url, no page at all. Public sharing was
entirely broken, silently, with nothing logged anywhere.

THE `deployments` TABLE HAS `url`, NOT `deploy_url`:
  - lib/server-fns/project-activity.ts - the activity feed showed no deployments.
  - routes/api/account/export.ts - the account export silently omitted every
    deployment. A GDPR export that quietly drops a section is worse than one that
    fails loudly.

THE `deployments` TABLE HAS `build_log`, NOT `error_message` (3 sites):
  - lib/server-fns/deploy-status.ts included it in a select, killing the whole
    query - while `url` sat correctly on the same line.
  - lib/deploy/publish-from-chat.ts and routes/api/deploy.ts both wrote it in the
    failure handler, so the update silently failed and a FAILED DEPLOY WAS NEVER
    MARKED FAILED. It kept its previous status indefinitely, which is why builds
    could appear stuck rather than errored.

The error_message trio share a root cause worth naming: `error_message` IS a real
field - on Netlify's status response, typed twenty lines above in the same file.
Someone reached for the name they had just written and put it into a table that
does not have it.

This is now the fifth and sixth instance of this bug class in this project
(health_findings' `source`/`line_number`, member_group_members' `user_id`,
app_error_events' `deploy_url` yesterday). Every one type-checked, deployed, and
did nothing. Assumed column names are invisible to every static check we run; only
the live schema settles it.

WHAT WAS DELIBERATELY NOT CHANGED. The sweep raised 67 hits; 61 are false
positives and were verified as such by reading the source rather than trusted
either way. They are JSONB keys inside `metadata` - decision_log,
connector_permissions, sandbox_id/phase/port, cloud_paused_* - which the parser
sees as top-level keys of `.update({...})` because it cannot tell it is inside a
nested object. Reporting those as bugs would have sent someone chasing thirty
things that work fine.

Separately flagged, NOT fixed here because each needs its own decision: four
references to tables that do not exist at all - `previews` (lib/ai/agent-browser.ts,
routes/api/projects/$id/preview.ts) and `project_ai_initiatives` /
`project_ai_initiative_events` (lib/ai/editor-lenses/persistence.ts). The lens
tables that DO exist are project_ai_agents, project_ai_agent_messages and
project_ai_agent_decisions.

Verified: re-running the sweep after the edits reports zero remaining deploy_url
or error_message mismatches, and all six files parse via the TypeScript compiler
API.
'@

$f = "D:\Projects\lifemarkai\.git\SCHEMA_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
git fetch origin 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log ("local  HEAD = " + (git rev-parse HEAD).Trim())
Log ("remote HEAD = " + (git rev-parse "origin/$branch").Trim())
Log "DONE"
