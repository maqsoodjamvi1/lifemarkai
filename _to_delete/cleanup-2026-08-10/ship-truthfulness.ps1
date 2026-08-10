$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-truthfulness-result.txt"
"=== SHIP: five truthfulness fixes $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"

if (Test-Path "D:\Projects\lifemarkai\.git\index.lock") {
  Log "removing stale index.lock"
  Remove-Item "D:\Projects\lifemarkai\.git\index.lock" -Force -ErrorAction SilentlyContinue
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }

$s = "migration/tanstack-start-app/src"

git add -- `
  "$s/lib/security/publish-gate.ts" `
  "$s/routes/api/deploy.ts" `
  "$s/lib/deploy/publish-from-chat.ts" `
  "$s/routes/api/cloud/health.ts" `
  "$s/routes/api/cloud/remove.ts" `
  "$s/components/editor/lifemark-cloud-panel.tsx" `
  "$s/lib/ai/subagents.ts" `
  "$s/components/editor/subagent-activity-card.tsx" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
fix: five places the product claimed something the code did not do

All five are the same defect class as the rest of this session: the system
reported, implied or offered a capability it did not actually have. None was
found by a user; each was found by checking a claim against the code.

1. PII WAS DETECTED AND THEN PUBLISHED ANYWAY.
The publish gate tested `severity === "critical"`. No PII rule can produce that
severity - the strongest are `high` (SSN, credit card) and the weakest is `low`
(an email address). So the scanner found card numbers, reported them honestly in
the Security panel, and never stopped a single deploy. Scanning for card numbers
and shipping them is worse than not scanning, because the scan implies a promise.

Blocking every `high` finding would have made an email address in a seed file a
publish-stopper, and a gate people route around is not a gate. The line drawn:
critical of any kind blocks; `high` + kind `pii` blocks; everything else is
reported only. Both classes are overridable, by two SEPARATE explicit flags -
accepting "this API key is fake" is a different decision from "yes, publish these
card numbers".

2. PUBLISHING FROM CHAT SKIPPED THE GATE ENTIRELY.
There were two ways to publish and only one was gated. routes/api/deploy.ts
scanned and refused with a 412; lib/deploy/publish-from-chat.ts talked to the
Netlify API itself and ran no scan at all. Same product, same user, opposite
behaviour, decided by which surface they happened to use - so "publish it" in chat
shipped code the Publish button would have refused.

Both now call `evaluatePublishGate` in the new lib/security/publish-gate.ts, which
is the single definition of what blocks a publish. The chat path accepts NO
override: overriding a security block is a decision made by looking at findings,
not something to infer from the words "publish it". If it trips, the user is told
what and where and can accept the risk from the Publish panel.

3. THE CLOUD HEALTH PANEL WAS ENTIRELY FABRICATED.
Not approximated - invented. Every metric was arithmetic on unrelated counts:

  ramUsed     = min(ramTotal, 80 + fileCount * 2)
  cpuLoadPct  = min(95, 10 + deployCount % 40)
  diskUsedMb  = fileCount * 1.5
  activeConns = 1 + deployCount % 12

Nothing touched the database. Adding a file "used more RAM"; deploying 40 times
wrapped CPU load back to 10%. It then derived memory-pressure / cpu-high /
disk-low flags from those numbers and told the user "Your Cloud database is
healthy" - a health verdict computed from data unrelated to health, which is
indistinguishable from a real one right up to the outage.

Now every value is read from the managed instance: uptime from
pg_postmaster_start_time, size from pg_database_size, connections and cache-hit
and rollback ratios and deadlocks from pg_stat_database, table count from
information_schema. Flags derive only from measured values against real Postgres
heuristics. RAM used and CPU load are NOT reported at all - the Management API's
SQL endpoint cannot see host metrics, so there is no honest number to give; the
response names them in `unavailable` and the panel renders "not measurable"
instead. Instance RAM/CPU still appear, labelled as capacity, because that is real
configuration rather than a live reading. An unreachable database now returns
status "unknown", not "healthy".

4. "3 subagents ran" WAS A UI FICTION.
lib/ai/subagents.ts was documented as "Lovable-style parallel read-only
investigations" and surfaced as "Investigating... 3/3". It contains no `await`,
makes no model call and spawns nothing: it tokenises the prompt and scores files
already in memory by keyword overlap. That is genuinely useful - it is how
relevant files reach the prompt - but it is a ranking function, and calling it an
agent invented capability we do not have.

Relabelled rather than rewritten: "Scanning codebase" / "Codebase scan complete",
the counter reads "3/3 areas", the badge says Scan, step titles say Scanned. The
module and SSE field names are kept (established internal vocabulary, and the
field is a client/server contract) with every claim of parallelism removed and the
real mechanism documented. Behaviour is unchanged and asserted to be unchanged.
Real parallel read-only agents remain possible later, but that is a new feature
with a real per-build cost and should be a priced decision, not a label.

5. deleteManagedProject() HAD ZERO CALL SITES.
Written, correct, and called from nowhere in the repo. Dead code that reads as a
feature is its own lie: the function implied "we can remove Cloud" and nothing
could. Wired rather than deleted, because removing Cloud is a real capability we
otherwise lack and the export path it pairs with already exists.

New POST /api/cloud/remove, with guardrails proportional to permanently deleting a
customer's database: ownership check; the project NAME typed exactly (a boolean is
too easy to send by accident); a separate `acknowledgeDataLoss` flag so one field
cannot satisfy both checks; and refusal when no backup is on record unless
`skipExportCheck` is set. Confirmation failures return 428.

The remote delete happens BEFORE local flags are cleared, deliberately. Clearing
first would strand a live paid instance with no record of it in our database -
the worst outcome here, because the user keeps being billed for something they can
no longer see. A failed remote delete changes nothing and says so; a failed local
clear is reported rather than swallowed.

Verified with 60 assertions against the real modules: card numbers and SSNs block
while a placeholder email does not, the two overrides are independent, the 412 body
never echoes a raw card number, both publish paths call the one gate and the chat
path takes no override, every synthetic health formula is gone and the route
reports `measured` plus an `unavailable` list, subagents.ts still has no await and
no UI string claims investigation, the scan still ranks the relevant file first,
and the remove route enforces every guardrail in the right order. All eight touched
files parse via the compiler API and publish-gate type-checks clean.

Two of those assertions initially failed against correct code because they matched
the comments that document the OLD behaviour verbatim; the suite now strips
comments and asserts on code. That also caught two real defects in my own edit: a
missed occurrence and a dropped space in the relabelled step titles.
'@

$f = "D:\Projects\lifemarkai\.git\TRUTH_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -5 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
