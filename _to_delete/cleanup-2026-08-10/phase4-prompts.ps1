# Batch 1 - prompt correctness. ASCII only.
# Run: powershell -NoProfile -ExecutionPolicy Bypass -File D:\Projects\lifemarkai\phase4-prompts.ps1
$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase4-prompts-result.txt"
"=== BATCH 1 PROMPTS $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }

Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }

$s = "migration/tanstack-start-app/src"
Log ""
Log "--- staging ---"
git add -- "$s/lib/ai/system-prompts.ts" "$s/lib/ai/http/chat.ts" "$s/lib/ai/mcp-context.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

git commit -m "fix(ai): stop feeding the model fiction and contradictions

Three defects in the live build prompt, all of which made generated code worse.

1. FABRICATED CONTEXT PRESENTED AS FACT.
lib/ai/mcp-context.ts appended a section headed '# Live MCP Context' whenever
the project's .env.local held a matching key. Every block was hardcoded demo
data: invented Linear tickets ('[ENG-142] Redesign onboarding flow'), a fake
Sentry TypeError with a fake event count, invented PostHog funnel numbers, and
- worst - LifemarkAI's OWN table list (profiles, projects, project_files,
messages, collaborators, deployments) handed to the model as the USER's schema.
NEXT_PUBLIC_SUPABASE_URL is present in essentially every backend-enabled
project, so most builds were being told a fictional database was real, then
writing queries against tables that do not exist. Injection removed; the module
is now a documented tombstone returning '' so nothing silently resurrects it.
The MCP settings panel keeps its own catalogue and never imported this.

2. THE BUILD PROMPT CONTRADICTED ITSELF.
buildGenerationPrompt serves four frameworks (tanstack-start, react, vue,
svelte) and concatenated the TanStack blueprint AND the Vite rules AND the
Vite-shaped import rules / file structure / react-router patterns. A TanStack
build was told 'Never emit index.html or src/main.tsx' and 'index.html - always
generate this' in the same prompt, and both 'Do NOT use path aliases like
@/components' and that @/* maps to src/*. Split into buildFrameworkContract():
tanstack-start gets TANSTACK_START_BLUEPRINT + a new TANSTACK_IMPORT_RULES,
everything else keeps the original Vite contract. framework is now threaded
from chat.ts into buildGenerationPrompt. Asserted on the assembled strings:
the TanStack prompt no longer contains the always-generate-index.html or
no-path-aliases lines, still forbids index.html/main.tsx and teaches
createFileRoute; the Vite prompt is unchanged in substance; both keep the
neutral design/quality/output blocks. Side effect: the TanStack prompt drops
from ~40k to ~33k chars because the contradictions were pure waste.

3. THE AGENT PROMPT LIED ABOUT ITS OWN RUNTIME.
AGENT_SYSTEM_PROMPT claimed 'Max 12 steps per task' against maxIterations = 30,
and documented 8 of 16+ tools. read_preview_console, read_preview_network,
browse_preview, read_ai_activity, web_search, fetch_url, db_query and
connector_call were passed in the tool schema but never described in prose, so
the most capable tools were the least likely to be used - the agent would guess
at a bug instead of reading the preview console that was sitting right there.
Documented all of them, grouped by purpose, with an explicit note that
conditionally-injected tools may be absent and must not be faked." 2>&1 | Out-File $log -Append -Encoding ascii

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
Log "--- HEAD ---"
git log --oneline -2 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git status --short 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
