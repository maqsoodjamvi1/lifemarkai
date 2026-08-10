# Align generated-app structure to a real Lovable export. ASCII only.
$ErrorActionPreference = "Continue"
$log = "D:\Projects\lifemarkai\phase5-lovable-shape-result.txt"
"=== LOVABLE SHAPE $(Get-Date -Format o) ===" | Out-File $log -Encoding ascii
function Log($m) { $m | Out-File $log -Append -Encoding ascii; Write-Host $m }
Set-Location "D:\Projects\lifemarkai"
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Log "branch=$branch"
if ($branch -eq "master") { Log "REFUSING to run on master"; exit 1 }
$s = "migration/tanstack-start-app/src"

# includes the uncommitted phase4 drift fix, which never got its own run
git add -- `
  "$s/lib/templates/lovable-vite-scaffold.ts" `
  "$s/lib/server-fns/projects.ts" `
  "$s/lib/ai/system-prompts.ts" `
  "$s/lib/ai/code-parser.ts" 2>&1 | Out-File $log -Append -Encoding ascii
git diff --cached --stat 2>&1 | Out-File $log -Append -Encoding ascii

git commit -m "feat(generation): match generated apps to a real Lovable export

Ground truth: an actual Lovable project export (package name
vite_react_shadcn_ts), read file by file rather than inferred. It is NOT
TanStack - it is Vite 5 + React 18 + shadcn/ui + react-router-dom v6.

Added lovable-vite-scaffold.ts reproducing that export's conventions exactly:
index.html + src/main.tsx + src/App.tsx; routing declared in App.tsx as
QueryClientProvider > TooltipProvider > Toaster > BrowserRouter > Routes with
every custom route above the path=* catch-all; pages at
src/pages/<PascalCase>.tsx with Index.tsx as home and NotFound.tsx as catch-all;
components.json for shadcn (style default, baseColor slate, cssVariables);
tailwind.config.ts in TypeScript with 'satisfies Config'; split
tsconfig/tsconfig.app/tsconfig.node, all non-strict; @vitejs/plugin-react-swc;
vite resolve.alias @ -> ./src plus the react/react-dom/jsx-runtime dedupe; the
sonner + tooltip primitives App.tsx imports, so the scaffold has no dangling
import on first paint. Default framework for NEW projects is now 'react' (this
shape). The PLATFORM stays TanStack Start - that is a separate concern from what
it generates, and tanstack-start remains fully supported and selectable.

The export also disproved a rule we were shipping. IMPORT_RULES told the model
'Do NOT use path aliases like @/components' - but every file in the export
imports through @/, and components.json declares @/components, @/lib/utils,
@/components/ui, @/hooks. Rewritten to mandate the alias, and extended with the
real project shape (src/pages, src/components/ui lowercase filenames,
src/integrations/supabase/client.ts reading VITE_SUPABASE_PUBLISHABLE_KEY,
tailwind.config.ts, register routes above the catch-all).

Three quality-gate bugs found by running the real scaffolds through the real
validator - each rejected CORRECT code and so burned an auto-fix round:
  - 'import path from \"path\"' in vite.config.ts raised missing_package at
    severity error. Node builtins are never dependencies; that exact line is in
    the export. Added an isNodeBuiltin() exemption (bare and node: forms).
  - Vite asset queries ('../styles.css?url') and routeTree.gen raised
    broken_import. The first resolves minus its suffix, the second is generated
    by the router plugin at dev startup. Both exempted.
  - the home-page lookup only matched pages/Home.tsx, but Lovable's home is
    pages/Index.tsx - so 'main' fell through to the longest page, often
    NotFound.tsx, and the sparse-page check graded the wrong file. Now matches
    (Index|Home).

Also carries the phase-4 drift fix that had not been committed: the framework
split finished (scaffold list + self-check + entry lines were still shipping
Vite paths to TanStack builds) and isTanStackProject added to the entry check,
page filter and pageCount so TanStack builds stop failing missing_entry and
too_few_pages on every single turn.

Verified against the real exported functions: both scaffolds return zero
severity-error findings; a finished 5-page Lovable-shape build returns zero
quality findings and grades Index.tsx as the home page; and the new exemptions
stay narrow - a genuinely missing package and a genuinely broken relative import
both still error." 2>&1 | Out-File $log -Append -Encoding ascii

git push origin $branch 2>&1 | Out-File $log -Append -Encoding ascii
Log ""
git log --oneline -3 2>&1 | Out-File $log -Append -Encoding ascii
Log "DONE"
