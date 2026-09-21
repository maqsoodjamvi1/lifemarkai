import { renderPackageAllowlistCompact } from "./package-allowlist.ts";
import { classifyBuildIntent, buildUserDirective } from "./build-intent.ts";
import {
  PROJECT_CONTRACT_PATH,
  PROJECT_CONTRACT_VERSION,
  type ProjectContract,
} from "./project-contract.ts";

export function buildProjectContractPrompt(request: string): string {
  const intent = classifyBuildIntent(request);
  return `You are LifemarkAI Architect. Produce a machine-checkable project contract for a greenfield TanStack Start app BEFORE any source files are written.

Return ONLY JSON with this shape:
{
  "version": ${PROJECT_CONTRACT_VERSION},
  "framework": "tanstack-start",
  "appType": "string",
  "files": [
    {
      "path": "src/routes/index.tsx",
      "purpose": "what this file owns",
      "owner": "scaffold|product|config|test",
      "exports": [{ "name": "Route", "kind": "named" }],
      "dependsOn": ["src/lib/utils.ts"]
    }
  ],
  "routes": [{ "path": "/", "file": "src/routes/index.tsx" }],
  "packages": [{ "name": "@tanstack/react-start", "dev": false }],
  "acceptanceTests": [
    { "id": "typecheck", "description": "tsc --noEmit", "kind": "typecheck" },
    { "id": "production-build", "description": "vite build", "kind": "build" },
    { "id": "smoke-home", "description": "home route renders", "kind": "smoke", "target": "/" }
  ]
}

Hard rules:
- TanStack Start only. No index.html, no src/main.tsx, no src/App.tsx, no react-router-dom.
- Required files: package.json, tsconfig.json, vite.config.ts, tailwind.config.js, postcss.config.js, src/styles.css, src/router.tsx, src/routes/__root.tsx, src/routes/index.tsx, src/lib/utils.ts, src/components/layout/Header.tsx, src/components/layout/Footer.tsx, src/components/layout/SiteChrome.tsx.
- Every page is a file under src/routes/ that exports Route via createFileRoute.
- src/router.tsx is platform-owned and exports only getRouter. Do not contract src/routeTree.gen.ts; the router plugin generates it.
- dependsOn must name other contracted file paths (not npm packages). The graph must be acyclic.
- List EVERY product file you will later generate. Files not listed will be discarded.
- List EVERY public export a dependent file will import.
- ${intent.singlePage
    ? "This is an explicit single-page request (one-page landing). Keep one home route plus the components it imports. Extra `src/routes/*.tsx` pages only when the request names them."
    : "This is a multi-page product. Plan every route, feature component, data-access module, and migration required by the blueprint below; do not collapse it into one home page."}
- Packages must come from this allowlist:
${renderPackageAllowlistCompact()}
- Plan at least ${intent.minFiles} meaningful files, matching the same completeness gate used after generation. Prefer composing existing scaffold chrome over inventing a second header.

Product requirements shared with generation and validation:
${buildUserDirective(intent)}
${intent.blueprint}

User request:
${request}`;
}

export function renderProjectContractPromptBlock(
  contract: ProjectContract,
  generationOrder: string[],
  opts?: { incremental?: boolean },
): string {
  const files = contract.files
    .map((file) => {
      const exports = file.exports.length > 0 ? file.exports.map((item) => item.name).join(", ") : "(none)";
      const deps = file.dependsOn.length > 0 ? file.dependsOn.join(", ") : "(none)";
      return `- ${file.path} [${file.owner}] ${file.purpose}\n  exports: ${exports}\n  dependsOn: ${deps}`;
    })
    .join("\n");
  const routes = contract.routes.map((route) => `- ${route.path} → ${route.file}`).join("\n");
  const packages = contract.packages.map((pkg) => pkg.name).join(", ");
  return `
---
# MACHINE-CHECKABLE PROJECT CONTRACT
This build is governed by ${PROJECT_CONTRACT_PATH}. Treat it as the source of truth.

## Generation order (dependencies first)
${generationOrder.map((path, index) => `${index + 1}. ${path}`).join("\n")}

## ${opts?.incremental ? "Existing contracted files (keep these; add only what the user asked for)" : "Files you may write (no others)"}
${files}

## Routes
${routes}

## Packages you may import
${packages}

Rules:
${opts?.incremental
  ? `- Keep contracted files unless the user asked to remove them.
- You MAY add product files the user requested (new \`src/routes/*.tsx\` pages via createFileRoute, plus components those pages import).
- Never add index.html, src/main.tsx, or src/App.tsx.
- Do not invent unused files. New files will be merged into ${PROJECT_CONTRACT_PATH}.`
  : `- Write EVERY contracted product file. Do not write files that are not listed.`}
- A file may import local modules only from its dependsOn list (plus CSS/?url and routeTree.gen).
- Named/default imports MUST match the target file's contracted exports.
- Do not invent npm packages. Do not add react-router-dom.
- Implement in generation order so callees exist before callers.
---`;
}
