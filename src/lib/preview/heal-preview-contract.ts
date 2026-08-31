/**
 * Heal broken import/export contracts BEFORE the preview compiles.
 *
 * Generated apps often import files/exports the model never wrote. The Babel
 * srcdoc preview then dies with opaque React errors (or `.map` on undefined)
 * and paints a white blank iframe. Self-verify already detects these via
 * `findContractErrors` — this module turns those findings into minimal stubs
 * so the rest of the app can still render in the editor preview.
 */
import type { ProjectFile } from "../../types/database.ts";
import {
collectExports,
findMissingExports,
findMissingModules,
type ProjectFileLike,
} from "@/lib/preview/export-contract";

function cloneFiles(files: ProjectFile[]): ProjectFile[] {
  return files.map((f) => ({ ...f, content: f.content ?? "" }));
}

function byPathMap(files: ProjectFile[]): Map<string, ProjectFile> {
  const map = new Map<string, ProjectFile>();
  for (const f of files) map.set(f.path.replace(/\\/g, "/"), f);
  return map;
}

function stubComponentSource(name: string, note: string): string {
  return `/** Auto-stub for preview — ${note} */
export function ${name}() {
  return (
    <div style={{ padding: 12, border: "1px dashed #f59e0b", borderRadius: 8, color: "#92400e", background: "#fffbeb", font: "12px ui-sans-serif, system-ui" }}>
      Missing file stub: ${name}
    </div>
  );
}
export default ${name};
`;
}

function stubPageSource(name: string, note: string): string {
  return `/** Auto-stub for preview — ${note} */
export default function ${name}() {
  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>${name}</h1>
      <p style={{ color: "#64748b", marginTop: 8 }}>This page was missing and was stubbed so the preview can load.</p>
    </div>
  );
}
`;
}

/**
 * Turn an arbitrary basename into a syntactically valid JS identifier by
 * PascalCasing every run of non-identifier characters away.
 *
 * `guessExportNameFromPath` used to return the raw basename verbatim (only
 * the extension stripped), which is fine for a name like "Hero" but not for
 * the very common kebab-case filenames generated apps actually use —
 * "hero-section.tsx" produced the bare string "hero-section", and
 * `stubComponentSource`/`stubPageSource` interpolate that straight into
 * `export function ${name}() {}`, emitting `export function hero-section()`:
 * a SyntaxError. The stub file — created specifically so a missing import
 * doesn't crash the preview — then fails to parse at all, which is strictly
 * worse than the unhealed `undefined` import it was meant to fix.
 */
function toValidComponentIdentifier(raw: string): string {
  const parts = raw.split(/[^A-Za-z0-9$]+/).filter(Boolean);
  let name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
  if (!name) name = "Missing";
  if (/^[0-9]/.test(name)) name = `_${name}`;
  return name;
}

function guessExportNameFromPath(expectedPath: string): string {
  const base = expectedPath.split("/").pop() || "Missing";
  const stem = base.replace(/\.(tsx|ts|jsx|js)$/i, "") || "Missing";
  return toValidComponentIdentifier(stem);
}

function findAliasSource(
  map: Map<string, ProjectFile>,
  expectedPath: string,
): { path: string; exportName: string } | null {
  const dir = expectedPath.split("/").slice(0, -1).join("/");
  const wanted = guessExportNameFromPath(expectedPath).toLowerCase();
  // Navbar ↔ Header, Footer already present, etc.
  const aliases: Record<string, string[]> = {
    navbar: ["Header", "Nav", "Navigation", "TopBar"],
    header: ["Navbar", "Nav", "Navigation"],
    nav: ["Header", "Navbar"],
  };
  const candidates = aliases[wanted] ?? [];
  for (const name of candidates) {
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      const p = `${dir}/${name}${ext}`;
      if (map.has(p)) return { path: p, exportName: name };
    }
  }
  return null;
}

function appendMissingExport(content: string, name: string): string {
  // Belt-and-suspenders: the primary defense against reporting a name that
  // IS already exported lives in export-contract.ts's findMissingExports.
  // This guard used a narrower regex that only matched a name declared
  // immediately after `export const/let/var` — it missed a name declared
  // later in a comma-separated list (`export const A = [], ${name} = []`),
  // so a stale/misbehaving caller could still have this function append a
  // SECOND `export const ${name}` for an already-exported name, producing a
  // duplicate-identifier SyntaxError. collectExports parses the whole
  // comma-separated declarator list, so this catches that case too.
  if (collectExports(content).names.has(name)) {
    return content;
  }
  // Array-ish mock data: safest default that stops `.map` crashes.
  if (/^MOCK_/i.test(name) || /(List|Items|Data|Posts|Links|Partners)$/.test(name)) {
    if (name === "MOCK_PARTNERS") {
      return `${content.trimEnd()}

/** Preview stub — missing export healed for live preview */
export const MOCK_PARTNERS = [
  { name: "Aurora", logo: "◆" },
  { name: "Northstar", logo: "◇" },
  { name: "Velvet", logo: "○" },
  { name: "Cascade", logo: "▲" },
];
`;
    }
    return `${content.trimEnd()}\n\n/** Preview stub — missing export healed for live preview */\nexport const ${name} = [];\n`;
  }
  // Date/format helpers commonly omitted from utils.
  if (/^format/i.test(name)) {
    return `${content.trimEnd()}\n\n/** Preview stub — missing export healed for live preview */\nexport function ${name}(value: unknown): string {\n  return value == null ? "" : String(value);\n}\n`;
  }
  // Type-looking PascalCase names (…Item, …Props, interfaces) — don't emit a
  // fake React component; a type alias is enough for Babel erase + contract.
  if (/^[A-Z][A-Za-z0-9]*(Item|Props|Type|Config|Options|Data|Entry|Record)$/.test(name)) {
    return `${content.trimEnd()}\n\n/** Preview stub — missing type healed for live preview */\nexport type ${name} = Record<string, any>;\n`;
  }
  // Component-like PascalCase → stub component
  if (/^[A-Z][A-Za-z0-9]*$/.test(name)) {
    return `${content.trimEnd()}\n\n/** Preview stub — missing export healed for live preview */\nexport function ${name}() {\n  return null;\n}\n`;
  }
  return `${content.trimEnd()}\n\n/** Preview stub — missing export healed for live preview */\nexport const ${name} = undefined as any;\n`;
}

function buildAliasModule(
  expectedPath: string,
  alias: { path: string; exportName: string },
  imported: string[],
): string {
  const rel = relativeImport(expectedPath, alias.path);
  const names = imported.length > 0 ? imported : [guessExportNameFromPath(expectedPath)];
  const lines = [`/** Preview alias — ${expectedPath} was missing; re-exporting ${alias.path} */`];
  for (const name of names) {
    if (name === "default") {
      lines.push(`export { ${alias.exportName} as default } from '${rel}';`);
    } else {
      lines.push(`export { ${alias.exportName} as ${name} } from '${rel}';`);
    }
  }
  // Always offer default for page/component default imports.
  if (!names.includes("default")) {
    lines.push(`export { ${alias.exportName} as default } from '${rel}';`);
  }
  return lines.join("\n") + "\n";
}

function relativeImport(fromPath: string, toPath: string): string {
  const fromParts = fromPath.split("/").slice(0, -1);
  const toNoExt = toPath.replace(/\.(tsx|ts|jsx|js)$/i, "");
  const toParts = toNoExt.split("/");
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  const up = fromParts.length - i;
  const down = toParts.slice(i).join("/");
  const rel = `${up === 0 ? "./" : "../".repeat(up)}${down}`;
  return rel.replace(/\\/g, "/");
}

/**
 * Return a healed copy of project files safe for `buildFallbackHtml`.
 * Never mutates the input array or original file objects.
 */
export function healPreviewContractGaps(files: ProjectFile[]): ProjectFile[] {
  const healed = cloneFiles(files);
  const map = byPathMap(healed);
  const like: ProjectFileLike[] = healed.map((f) => ({
    path: f.path.replace(/\\/g, "/"),
    content: f.content ?? "",
  }));

  for (const miss of findMissingModules(like)) {
    const expected = miss.expected.replace(/\\/g, "/");
    if (map.has(expected) || map.has(`${expected}.tsx`) || map.has(`${expected}.ts`)) continue;

    const stubPath = /\.(tsx|ts|jsx|js)$/i.test(expected) ? expected : `${expected}.tsx`;
    const alias = findAliasSource(map, stubPath.replace(/\.(tsx|ts|jsx|js)$/i, ""));
    const exportBase = stubPath.replace(/\.(tsx|ts|jsx|js)$/i, "");

    let content: string;
    if (alias) {
      content = buildAliasModule(stubPath, alias, miss.imported);
    } else if (/\/pages\//i.test(stubPath) || /\/app\/.*page$/i.test(exportBase)) {
      content = stubPageSource(guessExportNameFromPath(stubPath), miss.message);
    } else {
      content = stubComponentSource(guessExportNameFromPath(stubPath), miss.message);
    }

    const file: ProjectFile = {
      id: `preview-stub-${stubPath}`,
      project_id: healed[0]?.project_id ?? "",
      path: stubPath,
      content,
      language: "typescript",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    healed.push(file);
    map.set(stubPath, file);
    like.push({ path: stubPath, content });
  }

  // Re-scan exports after module stubs exist (importers of missing files are gone).
  for (const miss of findMissingExports(like)) {
    const modulePath = miss.module.replace(/\\/g, "/");
    const file = map.get(modulePath);
    if (!file) continue;
    const next = appendMissingExport(file.content ?? "", miss.name);
    if (next === file.content) continue;
    file.content = next;
    const idx = like.findIndex((f) => f.path === modulePath);
    if (idx >= 0) like[idx] = { path: modulePath, content: next };
  }

  return healed;
}
