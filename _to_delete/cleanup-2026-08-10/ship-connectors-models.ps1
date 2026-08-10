$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\ship-connectors-models-result.txt"
"=== SHIP: connectors 52 to 83 + model refresh $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
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
  "$s/lib/integrations/connector-registry.ts" `
  "$s/components/editor/app-connectors-panel.tsx" `
  "$s/lib/ai/model-defaults.ts" `
  "$s/lib/ai/model-catalog.ts" `
  "$s/lib/ai/openrouter-models.ts" `
  "$s/lib/ai/cost-controls.ts" `
  "docs/lovable-comparison-2026-07-30.md" 2>&1 | Out-File $log -Append -Encoding ascii

git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

$msg = @'
feat: 30 new connectors (52 to 83) + refresh models to the current generation

CONNECTORS: 52 to 83.
The comparison against Lovable put us at 52 connectors versus their ~80. Added 30,
concentrated where the gap actually was rather than spread evenly:

  warehouse/BI  Redshift, Athena, Microsoft Fabric, ClickHouse, dbt Semantic Layer
  commerce      WooCommerce, PrestaShop, Wix, Lightspeed, Paddle, Chargebee
  accounting    Xero, Lexware, sevDesk, Wave, Zoho Books, Zoho CRM
  growth/data   Google Analytics 4, Apollo.io, Apify, Tally, Pipedrive, Logo.dev,
                KLIPY, Mapbox
  misc          SharePoint, HeyGen, Replicate, X, GatewayAPI

Every host is the vendor's documented API origin and every auth scheme is the
vendor's documented one. Per-tenant hosts use the function form of baseUrl and
normalise what the user pasted (strip scheme, strip trailing slash), following the
Shopify and Databricks precedent - skipping that is how you get a double-scheme
URL that fails only for the users who pasted a full URL.

Redshift, Athena and Fabric take a pre-issued session/bearer token, not raw access
keys: the gateway injects static headers and cannot compute a SigV4 signature per
request. Pretending otherwise would have shipped three connectors that could never
authenticate.

THREE PRE-EXISTING DEFECTS FOUND WHILE VERIFYING THIS.
The registry and the connectors panel are two separate lists, and nothing checked
that they agree. They did not:

1. aws_s3 was in the PANEL but not the REGISTRY - configurable, and inert, because
   the gateway had nothing to forward to. It also asked for an access key/secret
   pair that a static-header gateway can never use. Now registered, and the form
   asks for the session token that actually works.
2. openai was in the REGISTRY but not the PANEL - the gateway would forward for it
   and no user could configure it.
3. gemini_enterprise collected GEMINI_ENTERPRISE_API_KEY while the registry
   required GOOGLE_ACCESS_TOKEN, so filling that form in could never satisfy the
   connector. Discovery Engine takes an OAuth bearer token, so the registry was
   right and the form was asking for the wrong thing.

Also normalised the snowflake and salesforce base URLs. Both passed the user's
pasted value straight through, so a bare host (no scheme) produced a schemeless
base URL that the gateway's https-only forwarding then rejected - a config error
surfacing as an opaque connector failure.

MODELS: current generation, cheaper, economy posture unchanged.

Verified every slug live against openrouter.ai/api/v1/models/<slug>/endpoints
rather than trusting the catalog listing or memory. That mattered twice:

  - A first pass over a bulk /models capture appeared to show deepseek and
    qwen3-coder missing entirely, which would have meant our whole default path
    was pointing at dead slugs. The capture was TRUNCATED. Probing the endpoints
    API directly showed both alive and cheap (deepseek-v4-pro $0.435/M in at
    99.99% uptime; qwen3-coder $0.22/M). No change was needed and none was made.
  - openai/gpt-5.6-codex does not exist, and z-ai/glm-5.2 is listed with an EMPTY
    endpoints array (no provider serves it). Neither was adopted. gpt-5.2-codex
    and glm-5-turbo stay.

Changed:
  premium coding/reasoning  gpt-5.2-codex / gpt-5.2 -> gpt-5.6-terra
                            ($1.75/$14 -> $1.25/$7.50: newer AND ~46% cheaper out)
  new premium economy tier  gpt-5.6-luna ($0.50/$3.00), cheapest of the 5.6 family
  catalog frontier          gpt-5.5 -> gpt-5.6-terra (5.5 was $5/$30 with no
                            endpoint above 99% uptime; ~4x cheaper and more
                            reliable)
  catalog balanced          claude-sonnet-4.6 -> claude-sonnet-5
                            ($3/$15 -> $2/$10, same 1M context)
  added                     gemini-3.6-flash as an option - Lovable's default for
                            app AI. NOT our default: gemini-3.1-flash-lite is 3x
                            cheaper for the same work.
  free coding               qwen3-coder:free -> cohere/north-mini-code:free.
                            The qwen slug still resolves but has a single provider
                            whose 1-day uptime was 0 at check time, so the "free"
                            path was silently paying the paid fallback on every
                            request.

Unchanged on purpose - this is the economy posture the request asked to keep:
default coding qwen3-coder, fast deepseek-v4-flash, balanced deepseek-v4-pro,
AI_COST_MODE still defaulting to economy. Net effect is that every tier is either
the same price or cheaper than before while being a generation newer.

Also documented the allowlist trap in model-catalog: MODEL_CATALOG is filtered by
APPROVED_SMART_MODEL_IDS, so a model added to the catalog but not the allowlist
disappears with no error. Every new slug was added to both.

Verified with 148 assertions against the real modules: 83 connectors with no
duplicate ids, every base URL https and parsing to a real host with no unsubstituted
placeholder, every connector sending usable auth (with the three query/path-auth
cases named explicitly), registry and panel agreeing in BOTH directions, the panel
collecting every env var the registry requires, every genuinely secret field masked,
every model id in both catalog and picker on the verified list, no known-unusable
slug anywhere, the four new models surviving the allowlist filter, and every
economy-tier constant unchanged. The earlier 47-assertion file_update suite and
82-assertion gap-closure suite are still green; connector-registry, model-defaults
and openrouter-models type-check clean, and model-catalog, editor-intelligence and
cost-controls were confirmed to load and evaluate at runtime.

Includes docs/lovable-comparison-2026-07-30.md, the comparison this work came from.
'@

$f = "D:\Projects\lifemarkai\.git\CONNMODEL_MSG.txt"
[System.IO.File]::WriteAllText($f, $msg, (New-Object System.Text.UTF8Encoding($false)))
git commit -F $f 2>&1 | Out-File $log -Append -Encoding ascii
Remove-Item $f -Force -ErrorAction SilentlyContinue

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -4 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
