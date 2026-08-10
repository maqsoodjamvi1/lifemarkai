# App-as-MCP rebuilt on Lovable's model + carries phase4/phase5. ASCII only.
$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase6-app-mcp-result.txt"
"=== APP-MCP $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }
$s = "migration/tanstack-start-app/src"

# phase4 (drift) + phase5 (lovable shape) never got committed - include them
git add -- `
  "$s/lib/ai/app-mcp-codegen.ts" `
  "$s/routes/api/projects/`$id/mcp-generate.ts" `
  "$s/lib/templates/lovable-vite-scaffold.ts" `
  "$s/lib/server-fns/projects.ts" `
  "$s/lib/ai/system-prompts.ts" `
  "$s/lib/ai/code-parser.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

git commit -m "feat(mcp): rebuild app-as-MCP on Lovable's architecture (per-caller RLS)

Ground truth: a real Lovable export shipping their MCP feature
(@lovable.dev/mcp-js 0.22.2) - .lovable/mcp/manifest.json, src/lib/mcp/tools/*,
a generated supabase/functions/mcp edge function, and mcpPlugin() in vite.config.

Our old model (routes/api/apps/:id/mcp) was a PLATFORM-HOSTED PROXY: config rows
in app_mcp, one static bearer token, each tool proxied as an HTTP call to the
app's deployed URL. Three consequences: every MCP caller was the SAME principal
so a tool could never act as the signed-in end user; all traffic ran through our
infra so we sat in the data path for other people's user data; and tools could
only do what an HTTP endpoint already exposed.

Lovable inverts it, and it is the better design. Tools are ordinary TypeScript in
the USER's repo, bundled into an edge function running in the USER's Supabase
project, and the caller's JWT is forwarded into supabase-js so ROW LEVEL SECURITY
performs authorisation. That is how their list_orders is genuinely admin-only
with zero permission code in the tool body.

Added lib/ai/app-mcp-codegen.ts emitting that exact layout:
  src/lib/mcp/runtime.ts          defineTool/defineMcp/auth/ok/fail
  src/lib/mcp/index.ts            server metadata + tool registry
  src/lib/mcp/tools/<kebab>.ts    one editable file per tool
  supabase/functions/mcp/index.ts Deno MCP JSON-RPC (initialize/ping/tools:list/
                                  tools:call, protocolVersion 2024-11-05)
  .lifemark/mcp/manifest.json     discovery manifest

DELIBERATE DIVERGENCE: their tools import from @lovable.dev/mcp-js, a package
only they publish. We emit a dependency-free runtime.ts into the app instead, so
a generated app keeps working after export/self-host and depends on nothing we
control.

Kept their ownership convention: files carry an AUTO-GENERATED banner and are
regenerated on publish; delete the banner and the file is treated as user-owned
and skipped, so hand-edited tools are never clobbered.

New route POST /api/projects/:id/mcp-generate writes the files into
project_files. It refuses when the project has no Supabase backend, because the
OAuth issuer must be the app's OWN project or the forwarded token would be
validated against the wrong tenant.

Verified: 4 fixed files + one per tool; every emitted TS file parses; the search
filter emits a real template literal that evaluates to
name.ilike.%mug%,slug.ilike.%mug% - byte-identical to the reference export's
line; byColumn tools emit .eq()+maybeSingle; filters/orderBy applied; manifest
matches the export's schema (path /functions/v1/mcp, oauth issuer from project
ref, accepted_audiences authenticated, readOnlyHint/idempotentHint/openWorldHint);
SERVICE_ROLE appears in zero generated files; a banner-deleted file is skipped
while a still-generated one is regenerated.

Also carries two earlier batches that never got their commit run:
- phase 4: finished the framework split (the scaffold list, the final self-check
  and four BUG_FREE_GENERATION_CONTRACT lines were still shipping index.html /
  src/main.tsx / BrowserRouter to TanStack builds) and added isTanStackProject to
  the entry check, page filter and pageCount, so TanStack builds stop failing
  missing_entry and too_few_pages on every single turn.
- phase 5: lovable-vite-scaffold.ts reproducing the export file-for-file, default
  framework for new projects back to 'react' (the platform itself stays TanStack
  Start), IMPORT_RULES corrected to MANDATE the @/ alias the export uses
  everywhere, plus three quality-gate fixes where correct code was rejected:
  Node builtins ('import path from \"path\"'), Vite asset queries (?url) and
  routeTree.gen, and a home-page lookup that only matched pages/Home.tsx while
  Lovable's home is pages/Index.tsx." 2>&1 | Out-File $log -Append -Encoding ascii

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git status --short 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
