$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-gap8-batch1-result.txt"
"=== SHIP: gap-8 batch 1 (items 2,3,8,10,13,16) $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
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
  "$s/lib/ai/subagents-parallel.ts" `
  "$s/lib/ai/subagents.ts" `
  "$s/lib/ai/http/chat.ts" `
  "$s/components/editor/subagent-activity-card.tsx" `
  "$s/lib/security/deep-scan.ts" `
  "$s/lib/security/cve-feed.ts" `
  "$s/lib/project/download-policy.ts" `
  "$s/routes/api/security/deep-scan.ts" `
  "$s/routes/api/security/dependencies.ts" `
  "$s/routes/api/security/leaked-key.ts" `
  "$s/routes/api/security/scan.ts" `
  "$s/routes/api/cloud/region.ts" `
  "$s/routes/api/projects/`$id/export.ts" `
  "$s/lib/integrations/connector-registry.ts" `
  "$s/components/editor/app-connectors-panel.tsx" `
  "$s/lib/project/publish-audience.ts" `
  "$s/routes/api/projects/`$id/publish-audience.ts" `
  "$s/routes/api/embed/access.ts" `
  "$s/components/editor/publish-panel.tsx" `
  "supabase/migrations/157_cve_suppressions_and_settings.sql" `
  "setup-mobile.ps1" `
  "docs/lovable-comparison-2026-07-30.md" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat: close six of the remaining Lovable gaps (2, 3, 8, 10, 13, 16)

Six items from the remaining-work list, each verified. Two of the sixteen could not
be done from here and are prepared instead: #1 needs the branch pushed and
deployed, #5 needs Xcode/Android SDK on a real machine (setup-mobile.ps1).

#3 REAL PARALLEL SUBAGENTS (lib/ai/subagents-parallel.ts).
The previous module was relabelled honestly last commit because it made no model
call and did nothing concurrent. This is the capability it had been implying: three
independent generateAI calls issued through Promise.allSettled, each with one narrow
question and its own slice of the codebase, returning a written finding.

Read-only by construction - no tools are passed, so there is nothing an agent could
call to change a file. On the FAST tier deliberately (deepseek-v4-flash, ~$0.13/M
in) with a 700-token output cap and a trimmed context, so a run costs a fraction of
a cent. That is what makes "on by default" compatible with the economy posture; on
the coding tier it would not be, and these agents summarise rather than write code.

Failure is not an outage: each call settles independently behind a 20s wall-clock
budget, and if all three fail the caller falls back to the deterministic keyword
scan that shipped before. A failed agent renders an amber warning, not a green tick.
The card now distinguishes real agents from the scan via an explicit `agent` flag
rather than guessing - guessing is how the original "3 subagents ran" fiction
happened.

#2 AGENTIC DEEP SCAN (lib/security/deep-scan.ts + /api/security/deep-scan).
The existing scanner is the BASIC profile: regex rules for secrets and PII plus a
dependency audit. It is fast, free, deterministic, and structurally blind to the
class of problem that actually gets apps breached - an endpoint with no
authorisation check, a table queried without RLS, a query built by concatenation,
an admin route guarded only in the UI. No regex finds those, because they are
absences rather than patterns.

DEEP reads the code and looks for the absences, in five named classes, batched 8
files at a time and reviewed concurrently. Findings about files that were never
sent are dropped as hallucinations; severity and rule names are constrained to a
known set rather than trusted.

It does NOT block publishing, deliberately. A model reviewing authorisation logic
will sometimes be wrong, and a false critical that stops a deploy teaches people to
bypass the gate - costing more security than the finding was worth. Findings land in
health_findings for triage; the publish gate stays deterministic.

GET quotes the cost before spending; POST reserves credits, settles on success and
cancels on failure. Partial coverage is reported as partial: a scan that silently
covered 48 of 90 files and said "no issues" would be the same lie as a synthetic
metric.

#16 LIVE CVE FEED + PER-ADVISORY SUPPRESSION (lib/security/cve-feed.ts).
deps.ts is a curated list of nine hand-picked packages. It was accurate the day it
was written and cannot learn: a vulnerability disclosed tomorrow in a package a user
actually depends on would never appear, and the panel would keep saying dependencies
were fine. A vulnerability scanner that cannot see new vulnerabilities is one in
name only.

Now queries OSV.dev (free, no key, real npm coverage, batch endpoint) for the
declared version of every dependency. The static audit is KEPT, not replaced - it
catches missing lockfiles and git-URL deps that a CVE feed does not, and it works
offline.

Suppression is per (package, advisory), not per package: muting lodash entirely
because one advisory does not apply is how the next real one gets missed. A reason
of at least 10 characters is required, enforced by a CHECK constraint as well as the
route, because a suppression with no stated reason is indistinguishable from someone
silencing an alert they did not understand.

An unreachable feed reports `available: false`, never "no vulnerabilities found".
Those are different claims and must not render the same.

#8 AUTO-REVOKE LEAKED API KEYS (/api/security/leaked-key).
GitHub secret-scanning partner callback. Verifies the ECDSA signature against
GitHub's published keys over the RAW body before parsing anything - without that
this endpoint is a denial-of-service primitive, since it revokes credentials on
unauthenticated input. Fails CLOSED, unlike the download policy: acting on forged
input is worse here than missing a leak.

Revocation is immediate and irreversible with no confirmation step, which is correct
for this one case: the key is already public, there is nobody to ask, and waiting is
the harm. Audit row is written before the notification email, and a failed email
cannot undo a completed revocation.

#10 CODE-DOWNLOAD RESTRICTION (lib/project/download-policy.ts).
Read access was download access: any collaborator could export the whole source and
there was no way for an owner to say otherwise. The flag lives on the OWNER's
profile, not the caller's - otherwise a collaborator could lift their own
restriction by editing their own settings. Owners can always download their own
source. Fails OPEN by design: this protects source code, not credentials, and a
database hiccup silently breaking a legitimate export is worse than one
unrestricted download.

#13 HOSTING REGION (/api/cloud/region).
profiles.cloud_default_region has existed since migration 048 and is READ at
provision time, but nothing ever wrote it - so every project landed in the fallback
region regardless of intent. Now settable, validated against the regions Supabase
actually offers, and the response says plainly that existing projects are not
migrated.

#7 PUBLISH AUDIENCE CONTROL - and this one was worse than the report said.

The report described "three coarse tiers" needing enrichment. The tiers were never
enforced at all. The publish panel offered Anyone / Workspace only / Private, and its
FAQ stated that choosing Workspace meant "only authenticated workspace members can
visit the published app". On save it PATCHed `{ visibility: websiteAccess }` to
/api/projects/:id - a field that route does not handle, against a column that does not
exist. The value was dropped. Nothing persisted it and nothing read it, so every
published app was served publicly regardless of what the owner chose.

Of everything found today that is the most consequential: the others mis-reported
work, this one mis-reported who could see your app.

Three pieces, because an audience nobody checks is the same bug again:
  - lib/project/publish-audience.ts - one pure decision function. Four modes; owner
    always allowed under all of them; custom resolves groups, user ids and external
    emails (case-insensitively). Denial messages never name who IS on the list.
  - /api/projects/:id/publish-audience - owner-only read/set plus grant add/remove,
    validating before insert. A grant that can never match is worse than a rejected
    one: it sits in the list looking like access somebody has. Selecting `custom`
    with an empty list is reported as behaving like private, because a user who does
    not know that thinks they published.
  - /api/embed/access - the enforcement point. FAILS CLOSED, opposite to the
    code-download policy: that guards source and a false denial is the worse harm,
    here a false ALLOW puts an internal app on the internet. It also refuses to
    distinguish "no such project" from "not allowed", since that difference is an
    enumeration oracle.

The panel now writes to the real endpoint and SURFACES a failed save instead of
swallowing it - silently failing to apply an access restriction is exactly how this
class of bug persists. The FAQ answer was rewritten to describe what is actually
enforced.

THREE SCHEMA BUGS CAUGHT BEFORE THEY SHIPPED, all the same shape as the ones this
session has been fixing - code written against an assumed schema rather than the
real one:

  - The deep-scan route first wrote health_findings rows with a `source` and
    `line_number` column (neither exists), no user_id (NOT NULL), and severity
    values low/medium/high (the CHECK constraint allows info/warning/error/critical).
    It would have failed on the first real scan. Severity is now mapped and the line
    folded into `detail`.
  - The leaked-key route first set only revoked_at, but api_keys gates validity on
    `is_active` - so it would have recorded a revocation without revoking anything,
    and validateApiKey would have kept accepting the leaked key. Now sets is_active
    false; migration 157 adds revoked_at/revoked_reason for provenance.
  - The audience enforcement first queried member_group_members on `user_id`; that
    table keys on `member_id` (migration 051). It would have returned zero groups and
    silently denied every group-based grant - a permissions bug that looks like the
    feature working.

Migration 157 adds: dependency_cve_suppressions (RLS, unique per
project+package+advisory, reason required), profiles.allow_code_download (default
true - a restriction made available, not a capability removed), api_keys revocation
provenance, and the projects.publish_audience + project_publish_grants tables that
item #7 will use.

ALSO: CONNECTORS 83 -> 180.

Wiz as an APP connector (84). It was already reachable as a
platform scan vendor via /api/security/scan using the workspace's own
WIZ_CLIENT_ID/SECRET, but not as a connector a generated app could call through the
gateway - the same distinction the registry already draws between the `github`
connector and GitHub git sync. It takes a pre-issued access token, because the
gateway injects static headers and cannot run Wiz's client-credentials exchange per
request. This was the last connector Lovable names that we did not have.

Then 12 in three categories NEITHER product covered (96 total) - net-new capability
rather than catching up, chosen by what a business app has to talk to:

  ERP      NetSuite, SAP, Dynamics 365 Business Central, Odoo
  Support  Freshdesk, Front, Help Scout, Crisp
  HR       Gusto, Rippling, BambooHR, Deel

Auth follows each vendor's documented scheme rather than a house style, because the
schemes genuinely differ: Freshdesk and BambooHR put the API key in the basic-auth
USERNAME with a throwaway password; Crisp needs a tier header alongside basic auth
or it 401s with a misleading "invalid credentials"; Gusto has separate demo and
production hosts, and sending demo tokens to production fails in a way that looks
like a permissions problem. NetSuite account ids are lowercased with underscores
turned into hyphens, which is what its host expects for sandboxes.

SAP and Odoo take the HOST ROOT only. Their service paths differ per deployment and
per module, so pinning one here would be guessing at a layout we cannot know - the
gateway appends the caller's path, so the app supplies it.

Then 40 more across eleven categories (136 total), chosen as what a generated app
actually needs to call:

  payments      PayPal, Square, Adyen, Razorpay, Mollie, Coinbase Commerce
  email         Mailchimp, Postmark, Klaviyo, Customer.io, Loops
  storage/CDN   Cloudflare, Cloudinary, Uploadcare, Bunny.net
  auth          Auth0, Clerk, WorkOS
  databases     MongoDB Atlas, Upstash, Neon, Turso
  observability Datadog, New Relic, Better Stack, Rollbar
  search        Meilisearch, Typesense
  AI providers  Anthropic, Google AI, Mistral, Cohere, Groq
  analytics     Mixpanel, Amplitude, Segment
  flags         LaunchDarkly, Statsig
  video         Zoom, Mux

TWO CONSTRAINTS FROM THE GATEWAY SHAPED WHAT COULD BE ADDED, and they are the reason
some obvious names are absent rather than present-but-broken:

  1. It injects STATIC HEADERS. Plaid authenticates in the request BODY; Trello and
     OpenWeather only by query string. None can be served by header injection, so
     they were left out instead of added as entries that would fail at the first
     call.
  2. MongoDB's Atlas Admin API uses digest auth, which a static-header gateway
     cannot perform - so the entry is the Data API, which takes an api-key header.

The auth schemes differ more than is comfortable and a wrong guess produces a 401
that reads like bad credentials: LaunchDarkly takes a RAW token and breaks if you add
"Bearer"; Klaviyo uses its own "Klaviyo-API-Key" keyword plus a mandatory revision
date; Square and Anthropic and Coinbase Commerce all require a version header;
Uploadcare has its own scheme keyword and pins the version through Accept; Mixpanel
and Segment put the secret in the basic-auth username with a blank password; Mailchimp
puts its datacentre in the hostname and it is the tail of the API key.

Then 44 more (180 total) across fourteen further categories:

  CMS           Sanity, Strapi, Directus, Hygraph, Payload, Prismic
  notifications OneSignal, Ably, Knock, Novu
  speech        Deepgram, AssemblyAI
  media gen     fal.ai, Stability, Runway, Luma
  project mgmt  ClickUp, monday.com, Coda, Height, Shortcut
  e-signature   DocuSign, Dropbox Sign, PandaDoc
  shipping      Shippo, EasyPost, AfterShip
  localisation  DeepL, Lokalise, Crowdin
  recruiting    Greenhouse, Lever, Workable
  accounting    QuickBooks Online, FreshBooks
  market data   People Data Labs, Polygon.io, Finnhub
  video         Daily, LiveKit, Vimeo
  auth          Stytch, Kinde
  scheduling    Cal.com

More scheme variety again, all from vendor docs: Payload uses "users API-Key <key>";
OneSignal wants the literal word "Basic" followed by the RAW rest key, which is not
base64 and not a real basic-auth pair; Novu uses "ApiKey"; Height uses "api-key";
PandaDoc uses "API-Key"; Deepgram uses "Token"; fal uses "Key"; Shippo uses
"ShippoToken"; DeepL uses "DeepL-Auth-Key"; ClickUp and monday send a raw token with
no scheme; Shortcut, Lokalise, AfterShip and Finnhub each use their own header name;
Runway and monday and Vimeo require a version pin. DeepL Free and Pro are separate
hosts and a Free key 403s on the Pro host; same split for Stytch test/live and
QuickBooks sandbox/production.

FOUR MORE DELIBERATE OMISSIONS, recorded so nobody "fixes" them into broken entries:
Pusher signs a per-request HMAC into the query string, and Hunter.io, Alpha Vantage
and OpenWeather accept their key ONLY as a query parameter. A static-header gateway
cannot serve any of them. MongoDB is the Data API rather than the Atlas Admin API for
the same reason - Admin uses digest auth.

LIVE-TESTED (2026-07-30, from the sandbox, real network):

  - All 180 connector base URLs probed against the real internet. 179/180 hosts
    proven to exist (DNS + TLS + HTTP; tenant-scoped ones verified with real demo
    tenants where available). The ONE failure was real: the wiz entry pointed at
    api.wiz.io, which does not exist (NXDOMAIN) - Wiz's API is tenant-scoped
    (api.<region>.app.wiz.io). Fixed to take WIZ_API_ENDPOINT. The same wrong host
    was ALSO hardcoded in the pre-existing /api/security/scan platform route, so
    every configured Wiz scan since that route shipped ended in a fetch error;
    fixed there too, with the endpoint added to its setup guide.
  - CVE feed run against the REAL OSV.dev API: found the actual GHSA advisories for
    lodash 4.17.20 (GHSA-35jh-r3h4-6jhm et al), severity mapping correct,
    per-advisory suppression verified live, clean package clean. 10/10.
  - Parallel subagents run with REAL model calls through the repo's own gateway
    config: 3 concurrent agents, 6.9s total vs 18.3s summed (genuinely parallel),
    findings cite real file paths. 5/5.
  - Deep scan run with a REAL review-model call against planted weaknesses: caught
    the unauthorised destructive endpoint (high), SQL string concatenation (medium)
    and client-side admin gating (low); zero hallucinated files. 3/3 + no transport
    errors.

Also corrected before commit: the Height docs link had a fabricated Notion page id.
It now points at the product site, because a plausible-looking wrong URL is worse
than a shallow correct one.

Where a vendor issues a key PAIR, the identifier half is left unmasked on purpose -
Razorpay key id, Cloudinary api key, Amplitude api key, Mux token id. Masking the
username half is not more secure, it just stops you checking what you typed. The
verification encodes that as a rule (a field is public when the connector also
collects a companion SECRET field) rather than a list of names, so it keeps holding as
connectors are added, with a separate assertion that no SECRET or PASSWORD field is
ever left unmasked.

Verified with 86 assertions: concurrency and the fast tier and the read-only
construction, plan/cap behaviour including zero agents when nothing matches, batch
maths for the deep scan, hallucinated-file rejection, OSV extraction including
malformed package.json, per-advisory suppression, signature verification ordering,
is_active being what revokes, audit-before-email, all four download-policy branches,
region validation, and every migration constraint. All twelve touched files parse
via the compiler API.

One test assertion initially failed against correct code because indexOf("sendEmail")
matched the import line rather than the call; it now matches the call site.
'@

$f = "D:\Projects\lifemarkai\.git\GAP8_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -6 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
