/**
 * One-shot: convert createServerFn wrappers in server-fns/ to plain async
 * functions so API route handlers don't hit production "Server function info
 * not found" 500s.
 *
 * Usage: node scripts/plainify-server-fns.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(__dirname, "../src/lib/server-fns");

const SKIP = new Set([
  // Already plain
  "project-files.ts",
  "billing.ts",
  "chat-state.ts",
  "comments.ts",
  "deploy-status.ts",
  "env.ts",
  "preview-telemetry.ts",
  "project-activity.ts",
]);

function convert(src) {
  let out = src;

  // Drop createServerFn / zod-adapter imports when unused after conversion
  out = out.replace(
    /^import \{ createServerFn \} from "@tanstack\/react-start";\r?\n/m,
    "",
  );
  out = out.replace(
    /^import \{ zodValidator \} from "@tanstack\/zod-adapter";\r?\n/m,
    "",
  );

  // Pattern: export const name = createServerFn(...).validator(...).handler(async ({ data }) => {
  // Also: export const name = createServerFn(...).handler(async () => {
  // Also: export const name = createServerFn(...).handler(async ({ data }) => {
  out = out.replace(
    /export const (\w+) = createServerFn\(\{ method: "[A-Z]+" \}\)\s*\n(?:\s*\.validator\([\s\S]*?\))\s*\n\s*\.handler\(async \(\{ data \}\) => \{/g,
    "export async function $1(data) {",
  );
  out = out.replace(
    /export const (\w+) = createServerFn\(\{ method: "[A-Z]+" \}\)\s*\n\s*\.handler\(async \(\{ data \}\) => \{/g,
    "export async function $1(data) {",
  );
  out = out.replace(
    /export const (\w+) = createServerFn\(\{ method: "[A-Z]+" \}\)\.handler\(async \(\) => \{/g,
    "export async function $1() {",
  );
  out = out.replace(
    /export const (\w+) = createServerFn\(\{ method: "[A-Z]+" \}\)\s*\n\s*\.handler\(async \(\) => \{/g,
    "export async function $1() {",
  );

  // Closing of createServerFn was `});` — plain functions end with `}`
  // Only replace the trailing `});` that closed .handler — tricky.
  // After conversion, `.handler(...})` becomes `function...}` so leftover `});` → `}`
  // Heuristic: lines that are only `});` after a function body often need `}`
  // Safer: replace `  });\n\nexport` patterns that were end of handlers
  out = out.replace(/\n  \}\);\n\nexport /g, "\n}\n\nexport ");
  out = out.replace(/\n  \}\);\n$/g, "\n}\n");
  out = out.replace(/\n\}\);\n\nexport /g, "\n}\n\nexport ");
  out = out.replace(/\n\}\);\s*$/g, "\n}\n");

  // Remove unused z imports if zodValidator was the only consumer — keep z if still used
  if (!/\bz\./.test(out) && !/\bz\s/.test(out.replace(/^import.*$/gm, ""))) {
    out = out.replace(/^import \{ z \} from "zod";\r?\n/m, "");
  }

  // Header note
  if (!out.includes("Plain helpers — not createServerFn")) {
    out = out.replace(
      /^(\/\*\*[\s\S]*?\*\/\n)/,
      (m) =>
        m.includes("createServerFn")
          ? m.replace(
              /createServerFn[^*\n]*/g,
              "plain helpers for API route handlers",
            )
          : `/**\n * Plain helpers — not createServerFn (see project-files.ts).\n */\n`,
    );
  }

  return out;
}

let converted = 0;
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith(".ts") || SKIP.has(name)) continue;
  const full = path.join(dir, name);
  const src = fs.readFileSync(full, "utf8");
  if (!src.includes("createServerFn")) continue;
  const next = convert(src);
  if (next === src) {
    console.warn("no change:", name);
    continue;
  }
  if (next.includes("createServerFn")) {
    console.warn("still has createServerFn:", name);
  }
  fs.writeFileSync(full, next);
  converted++;
  console.log("converted", name);
}
console.log("done", converted);
