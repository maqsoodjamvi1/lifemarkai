# Finish the framework split + fix the TanStack quality gate. ASCII only.
$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase4-drift-result.txt"
"=== DRIFT FIX $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }
$s = "migration/tanstack-start-app/src"
git add -- "$s/lib/ai/system-prompts.ts" "$s/lib/ai/code-parser.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

git commit -m "fix(ai): finish the framework split and stop the quality gate failing every TanStack build

CORRECTION to 2db641d. That commit claimed 'exactly one contract ships per
framework'. It did not. VITE_RULES and IMPORT_RULES moved behind the framework
switch, but three Vite-specific things stayed in the shared path and still
shipped to TanStack builds:
  - the 'Minimum scaffold (always include)' list naming index.html,
    src/main.tsx and src/App.tsx, which lives in the Output Format section
  - buildGenerationPrompt's final self-check, demanding index.html with a
    /src/main.tsx script
  - four lines of BUG_FREE_GENERATION_CONTRACT hardcoding the Vite entry and
    BrowserRouter
The verification I wrote grepped for the exact phrasings I expected
('index.html - always generate this') and missed 'Minimum scaffold (always
include): index.html', so it passed while the contradiction was intact. Rewritten
as a property assertion instead: no forbidden path may appear on any
non-prohibition line of a TanStack prompt. That immediately found all three, plus
a fourth - an explanation I had mistakenly written INTO the prompt text where the
model would read it.

Scaffold list is now VITE_SCAFFOLD_LIST / TANSTACK_SCAFFOLD_LIST chosen by
framework; FRAMEWORK_NEUTRAL_BLOCKS became frameworkNeutralBlocks(framework); the
self-check branches; the entry-point lines left the neutral contract entirely.

MUCH BIGGER: the quality gate rejected the DEFAULT framework on every turn.
code-parser only recognised App.tsx / src/main.tsx as an entry, and only
src/pages/** as pages. A TanStack project has neither. Consequences per build:
  - missing_entry (severity error) -> shouldAutoFix -> a full extra repair pass
    on ESCALATION_MODEL (opus), on EVERY build, asking the model to create the
    exact files its own prompt forbids
  - pageCount stuck at 0 -> too_few_website_pages / _ecommerce_ / _erp_ fired no
    matter how many routes were produced -> a guaranteed enrichment round too
  - the sparse-page check silently disabled, since `main` resolved to a
    non-existent App.tsx
So every TanStack build was paying for two extra AI rounds and being pushed
toward output that breaks the tanstackStart() entry. Added isTanStackProject
(detected from src/routes/__root.tsx) to the entry check, the page-file filter,
the home-page lookup and pageCount; API routes and __root are excluded from the
page count.

Verified against the real functions, not a mock: a 5-route TanStack build now
returns zero validation and zero quality errors; a Vite project with App.tsx is
still clean; a project with no entry at all STILL errors, so the check was
narrowed, not disabled." 2>&1 | Out-File $log -Append -Encoding ascii

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -2 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
