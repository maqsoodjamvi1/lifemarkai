/**
 * Static import/export diagnosis for preview healing prompts.
 * Finds missing files and default vs named export mismatches.
 */

export interface DiagnosableFile {
  path: string;
  content: string;
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
}

function resolveRelativeImport(fromFile: string, spec: string): string {
  const clean = spec.replace(/\.(tsx?|jsx?)$/, "");
  if (clean.startsWith("@/")) return normalizePath(`src/${clean.slice(2)}`);
  if (!clean.startsWith(".")) return normalizePath(clean);
  const base = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const parts = `${base}/${clean}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p) out.push(p);
  }
  return normalizePath(out.join("/"));
}

function pathVariants(resolved: string): string[] {
  const base = normalizePath(resolved);
  return [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
    `src/${base}`,
    `src/${base}.tsx`,
    `src/${base}.ts`,
  ].map(normalizePath);
}

/**
 * Comments are legal inside an import clause and models write them:
 *
 *     import {
 *       Button, // primary
 *       Card,
 *     } from "@/components/ui/kit";
 *
 * A naive comma split glues `// primary` onto `Card`, so `Card` is looked up as
 * the symbol `"// primary\n  Card"`, never found, and reported as a broken
 * import — straight into the healing prompt, which then "fixes" working code.
 */
function stripImportComments(clause: string): string {
  return clause.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function isProjectImportSpec(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("src/");
}

/**
 * Specifiers that are NOT JavaScript modules and must never be export-checked.
 *
 * This checker feeds the preview-healing prompt, so a false positive here is not
 * cosmetic — it becomes an instruction to the repair model. The canonical
 * TanStack Start document root opens with
 *
 *     import appCss from "../styles.css?url";
 *
 * which is correct and required (the `?url` is what makes Vite hand back a URL
 * for the `links: [{ rel: "stylesheet", href: appCss }]` entry). The checker
 * resolved it as a source module, found no `export default` in a stylesheet, and
 * reported `src/styles.css has no default export`. The repair pass duly "fixed"
 * it by deleting the `?url` — leaving `appCss` undefined and the stylesheet href
 * broken. That is how a working preview turned into an unstyled one, twice.
 *
 * Same class of bug for `src/routeTree.gen`: the tanstackStart() Vite plugin
 * writes it at dev and build time, so it is correctly absent from the project's
 * files, and `import { routeTree } from "./routeTree.gen"` is correct code that
 * this checker reported as a missing file / missing named export.
 */
const ASSET_EXTENSION_RE =
  /\.(css|scss|sass|less|styl|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp4|webm|mp3|wav|json|txt|md|glsl|wasm)$/i;

function isNonModuleSpec(spec: string): boolean {
  // Any Vite query suffix — ?url, ?raw, ?inline, ?worker — is an instruction to
  // the bundler, not part of a module path.
  if (spec.includes("?")) return true;
  const bare = spec.split("?")[0];
  if (ASSET_EXTENSION_RE.test(bare)) return true;
  if (/routeTree\.gen$/.test(bare.replace(/\.[jt]sx?$/, ""))) return true;
  return false;
}

function fileIndex(files: DiagnosableFile[]): Map<string, DiagnosableFile> {
  const idx = new Map<string, DiagnosableFile>();
  for (const f of files) {
    const n = normalizePath(f.path);
    idx.set(n, f);
    if (n.startsWith("src/")) idx.set(n.slice(4), f);
    else idx.set(`src/${n}`, f);
  }
  return idx;
}

function findFile(idx: Map<string, DiagnosableFile>, resolved: string): DiagnosableFile | null {
  for (const v of pathVariants(resolved)) {
    const hit = idx.get(normalizePath(v));
    if (hit) return hit;
  }
  return null;
}

function hasDefaultExport(content: string): boolean {
  return /export\s+default\b/m.test(content);
}

function hasNamedExport(content: string, name: string): boolean {
  const re = new RegExp(
    `export\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`,
  );
  if (re.test(content)) return true;
  // Type-level exports are legitimate named-import targets in TS — without
  // this, every `import { SomeType }` from a types module was flagged as
  // "not exported" (false positive flooding the healing prompts).
  const typeRe = new RegExp(`export\\s+(?:type|interface|enum)\\s+${name}\\b`);
  if (typeRe.test(content)) return true;
  // export { Name } / export type { Name } / export { Foo as Name }
  for (const match of content.matchAll(/\bexport\s+(?:type\s+)?\{([^}]+)\}/g)) {
    for (const raw of stripImportComments(match[1]).split(",")) {
      const parts = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/i).map((s) => s.trim());
      const exported = parts[parts.length - 1];
      if (exported === name) return true;
    }
  }
  return false;
}

interface ParsedImport {
  fromFile: string;
  spec: string;
  defaultName?: string;
  named: string[];
}

function parseRelativeImports(file: DiagnosableFile): ParsedImport[] {
  const out: ParsedImport[] = [];
  const content = file.content;
  const specPattern = `((?:\\.{1,2}\\/|@\\/|src\\/)[^'"]+)`;

  const defaultOnly =
    new RegExp(`\\bimport\\s+(?!type\\b)(\\w+)\\s+from\\s+['"]${specPattern}['"]\\s*;?`, "g");
  let m: RegExpExecArray | null;
  while ((m = defaultOnly.exec(content)) !== null) {
    if (!isProjectImportSpec(m[2])) continue;
    out.push({
      fromFile: file.path,
      spec: m[2],
      defaultName: m[1],
      named: [],
    });
  }

  const namedOnly =
    new RegExp(`\\bimport\\s+(?:type\\s+)?\\{([^}]+)\\}\\s+from\\s+['"]${specPattern}['"]\\s*;?`, "g");
  while ((m = namedOnly.exec(content)) !== null) {
    if (!isProjectImportSpec(m[2])) continue;
    const named = stripImportComments(m[1])
      .split(",")
      // `import { type Foo, Bar }` — strip the inline type keyword so the
      // symbol name (not "type Foo") is what we look up.
      .map((s) => s.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
      .filter((s) => s !== "type")
      .filter(Boolean);
    out.push({ fromFile: file.path, spec: m[2], named });
  }

  const mixed =
    new RegExp(`\\bimport\\s+(?!type\\b)(\\w+)\\s*,\\s*\\{([^}]+)\\}\\s+from\\s+['"]${specPattern}['"]\\s*;?`, "g");
  while ((m = mixed.exec(content)) !== null) {
    if (!isProjectImportSpec(m[3])) continue;
    const named = stripImportComments(m[2])
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter((s) => s !== "type")
      .filter(Boolean);
    out.push({ fromFile: file.path, spec: m[3], defaultName: m[1], named });
  }

  return out;
}

/** Returns human-readable issues (missing paths, export mismatches). */
export function diagnoseBrokenImports(files: DiagnosableFile[]): string[] {
  const idx = fileIndex(files);
  const issues: string[] = [];
  const seen = new Set<string>();

  function push(issue: string) {
    if (seen.has(issue)) return;
    seen.add(issue);
    issues.push(issue);
  }

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/i.test(file.path)) continue;
    for (const imp of parseRelativeImports(file)) {
      if (isNonModuleSpec(imp.spec)) continue;
      const resolved = resolveRelativeImport(imp.fromFile, imp.spec);
      const target = findFile(idx, resolved);

      if (!target) {
        push(
          `${imp.fromFile}: import from "${imp.spec}" - file not found (expected ${resolved}.tsx or similar)`,
        );
        continue;
      }

      if (imp.defaultName) {
        if (!hasDefaultExport(target.content)) {
          if (hasNamedExport(target.content, imp.defaultName)) {
            push(
              `${imp.fromFile}: \`import ${imp.defaultName} from "${imp.spec}"\` but ${target.path} uses named export - add \`export default ${imp.defaultName}\` or switch to \`import { ${imp.defaultName} }\``,
            );
          } else {
            push(
              `${imp.fromFile}: \`import ${imp.defaultName} from "${imp.spec}"\` but ${target.path} has no default export`,
            );
          }
        }
      }

      for (const name of imp.named) {
        if (!hasNamedExport(target.content, name) && !hasDefaultExport(target.content)) {
          push(
            `${imp.fromFile}: named import \`{ ${name} }\` from "${imp.spec}" not exported in ${target.path}`,
          );
        } else if (!hasNamedExport(target.content, name) && name !== "default") {
          // Mixing up default vs. named import of a same-named component is a
          // common AI-generated mistake (`import { Button } from "./Button"`
          // against a file with only `export default function Button(){}`).
          // This USED to suppress the report entirely whenever the imported
          // name matched the default export's function name — silently
          // letting a genuinely broken import (no named binding `${name}`
          // exists; Vite/esbuild fails it at runtime with "does not provide
          // an export named") reach the preview instead of the healing
          // prompt. Report it with the same actionable phrasing used above
          // for the reverse mismatch.
          const isSameNameDefault =
            hasDefaultExport(target.content) &&
            new RegExp(`export\\s+default\\s+function\\s+${name}\\b`).test(target.content);
          if (isSameNameDefault) {
            push(
              `${imp.fromFile}: \`import { ${name} }\` from "${imp.spec}" but ${target.path} exports it as \`export default\` - use \`import ${name} from "${imp.spec}"\` or switch to \`export { ${name} }\``,
            );
          } else {
            push(
              `${imp.fromFile}: \`{ ${name} }\` not found in ${target.path} - check export name`,
            );
          }
        }
      }
    }
  }

  return issues;
}

export function appendImportDiagnosis(
  prompt: string,
  files: DiagnosableFile[],
): string {
  const issues = diagnoseBrokenImports(files);
  if (issues.length === 0) return prompt;
  return [
    prompt,
    "",
    "Import diagnosis (fix these first):",
    ...issues.map((i) => `- ${i}`),
  ].join("\n");
}
