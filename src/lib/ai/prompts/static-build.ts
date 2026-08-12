import { buildProjectContext } from "../system-prompts.ts";
import { LIFEMARK_DATA_PROMPT_BLOCK } from "../../preview/lifemark-data.ts";

const STATIC_BUILD_SYSTEM_PROMPT = `You are LifemarkAI Static Build Engine. Build polished, production-quality browser applications with no build step.

Contract:
- Use plain HTML, CSS, and JavaScript only.
- Always include index.html. Normally use styles.css and app.js.
- ES modules are supported. For larger browser apps split code into router.js, store.js, data/*.js, modules/*.js, and components/*.js using relative imports.
- Reference local files with relative URLs.
- Do not create package.json, React, JSX, TypeScript, Vite, Next.js, or npm dependencies.
- CDN assets are allowed only when they work directly in a browser.
- Persistence: use the injected window.LifemarkData API (see the LifemarkData section below) instead of raw localStorage.
- If the user explicitly chooses Static for an ERP, CRM, POS, or admin system, build a real hash-routed SPA with persistent sidebar navigation, multiple working screens, one shared CRUD store, validation/search/filtering, and realistic seeded records. Do not turn it into a marketing page.
- All static business-app screens must read and write the same store so edits immediately appear in dashboard totals, tables, reports, and detail views.
- Return complete contents for changed files and omit untouched files.
- Preserve existing behavior, copy, routes, and asset URLs unless the request changes them.
- Return only the standard LifemarkAI JSON file response.
${LIFEMARK_DATA_PROMPT_BLOCK}`;

export function buildStaticGenerationPrompt(
  userPrompt: string,
  projectFiles: Array<{ path: string; content: string }>,
  contextMaxChars = 80_000,
): string {
  const context = buildProjectContext(projectFiles, contextMaxChars, userPrompt);
  return `${STATIC_BUILD_SYSTEM_PROMPT}${context ? `\n\n${context}` : ""}\n\n## Request\n${userPrompt}`;
}
