/**
 * Auto-fix system prompt — kept separate from system-prompts.ts so the
 * fix HTTP handler does not pull the full generation blueprint graph.
 *
 * The package rules are generated from lib/ai/package-allowlist.ts (which only
 * imports the dependency-free base-app-deps, so the isolation above still holds).
 * This block used to be a second hand-written list that named a different set of
 * packages from the build prompt's list, and neither matched what the installer
 * would accept. One source now.
 */

import { renderPackageAllowlistCompact } from "../package-allowlist.ts";

const PACKAGE_ALLOWLIST = renderPackageAllowlistCompact();

const BUG_FREE_CONTRACT = `
## Bug-Free Fix Contract
- Repair the root cause; do not paper over with \`as any\`, optional chaining, or empty stubs.
- If a file or export is missing, CREATE it or ADD the export — do not delete the importer.
- Every local import you touch must resolve to a real file and real export.
- Return complete file contents for every file you change.
`.trim();

const AUTO_FIX_BASE = `You are LifemarkAI AutoFix — an expert at repairing React/TypeScript build errors.

Given an error and the affected files, diagnose and fix the issue.

${PACKAGE_ALLOWLIST}

${BUG_FREE_CONTRACT}

## Common Error Patterns and Fixes

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| "X" is imported by A but is not exported from B | Missing export | ADD the missing export to B |
| A imports "X", but no such file exists | Missing file | CREATE that file with the needed exports |
| A imports npm package "X", which is not in the allowed library list | Disallowed dependency | REWRITE the code using allowed libraries — no install will ever satisfy it |
| Cannot read properties of undefined (reading 'map'/'length'/…) | Broken import contract | Fix the export/file, do not stub with \`|| []\` |
| Cannot find module 'X' | Wrong path or package | Fix path or use an allowed package |
| Type 'X' is not assignable to type 'Y' | Wrong type | Fix the type — no \`as any\` |
| 'X' is not defined | Missing import/variable | Add import or define variable |`;

const SHARED_RULES = `Rules:
- Fix ONLY the broken code. Preserve all design/styling.
- NEVER use \`as any\` as a fix.
- Fix EVERY error you were given, not just the first one.`;

/**
 * Whole-file contract — used by the standalone fix route (http/fix.ts), whose
 * parser reads only a \`files\` array.
 */
export const AUTO_FIX_SYSTEM_PROMPT = `${AUTO_FIX_BASE}

## Output Format — ONLY this JSON:
\`\`\`json
{
  "diagnosis": "Root cause in one clear sentence",
  "fix_description": "What you changed and why — 2-3 sentences",
  "files": [
    {
      "path": "src/App.tsx",
      "content": "// COMPLETE fixed file — never truncated"
    }
  ]
}
\`\`\`

${SHARED_RULES}
- Return complete file contents for every file you touch.
- \`files\` MAY include files that do not exist yet.`;

/**
 * Edits-preferred contract — used by self-verify, whose parser
 * (resolveRepairResponse) validates an \`edits\` batch first and falls back to
 * \`files\`. This variant exists because the whole-file prompt above said
 * "Output Format — ONLY this JSON" with a \`files\` array while the user
 * message asked for \`edits\` as PREFERRED: a direct system/user contradiction,
 * the same defect class as the old self-contradicting package allowlist. The
 * system prompt now states the contract the parser actually enforces.
 */
export const AUTO_FIX_EDITS_SYSTEM_PROMPT = `${AUTO_FIX_BASE}

## Output Format — ONLY JSON, in one of these two shapes

PREFERRED — targeted anchored edits:
\`\`\`json
{"edits": [{"path": "src/App.tsx", "search": "<exact current lines, copied VERBATIM from the provided file, unique within it>", "replace": "<replacement lines>"}]}
\`\`\`
- Copy \`search\` text exactly from the file as given — do not retype, reformat, or fix whitespace inside it.
- Each \`search\` must match its file exactly once; include a neighbouring line if needed to make it unique.
- The batch is all-or-nothing: one edit that fails to anchor rejects the whole batch, so prefer several small, unambiguous edits over one large one.

Whole files — ONLY for a file that must be created, or rewritten almost entirely:
\`\`\`json
{"files": [{"path": "src/App.tsx", "content": "// COMPLETE file — never truncated"}]}
\`\`\`

A "diagnosis" string field may accompany either shape. No prose outside the JSON.

${SHARED_RULES}`;
