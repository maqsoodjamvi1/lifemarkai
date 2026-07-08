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
  return re.test(content);
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

  const defaultOnly =
    /import\s+(\w+)\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?/g;
  let m: RegExpExecArray | null;
  while ((m = defaultOnly.exec(content)) !== null) {
    out.push({
      fromFile: file.path,
      spec: m[2],
      defaultName: m[1],
      named: [],
    });
  }

  const namedOnly =
    /import\s+\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?/g;
  while ((m = namedOnly.exec(content)) !== null) {
    const named = m[1]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    out.push({ fromFile: file.path, spec: m[2], named });
  }

  const mixed =
    /import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?/g;
  while ((m = mixed.exec(content)) !== null) {
    const named = m[2]
      .split(",")
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
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
      const resolved = resolveRelativeImport(imp.fromFile, imp.spec);
      const target = findFile(idx, resolved);

      if (!target) {
        push(
          `${imp.fromFile}: import from "${imp.spec}" — file not found (expected ${resolved}.tsx or similar)`,
        );
        continue;
      }

      if (imp.defaultName) {
        if (!hasDefaultExport(target.content)) {
          if (hasNamedExport(target.content, imp.defaultName)) {
            push(
              `${imp.fromFile}: \`import ${imp.defaultName} from "${imp.spec}"\` but ${target.path} uses named export — add \`export default ${imp.defaultName}\` or switch to \`import { ${imp.defaultName} }\``,
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
          const onlyDefault =
            hasDefaultExport(target.content) &&
            new RegExp(`export\\s+default\\s+function\\s+${name}\\b`).test(target.content);
          if (!onlyDefault) {
            push(
              `${imp.fromFile}: \`{ ${name} }\` not found in ${target.path} — check export name`,
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
