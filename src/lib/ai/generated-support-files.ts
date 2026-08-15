export interface MinimalGeneratedFile {
  path: string;
  content: string;
  language?: string;
}

type SupportSpec = {
  canonicalName: string;
  language: string;
  content: (path: string) => string;
};

const UI_SUPPORT: Record<string, SupportSpec> = {
  button: {
    canonicalName: "Button",
    language: "typescriptreact",
    content: buttonFile,
  },
  card: {
    canonicalName: "Card",
    language: "typescriptreact",
    content: cardFile,
  },
  badge: {
    canonicalName: "Badge",
    language: "typescriptreact",
    content: badgeFile,
  },
  input: {
    canonicalName: "Input",
    language: "typescriptreact",
    content: inputFile,
  },
  select: {
    canonicalName: "Select",
    language: "typescriptreact",
    content: selectFile,
  },
  dialog: {
    canonicalName: "Dialog",
    language: "typescriptreact",
    content: dialogFile,
  },
  table: {
    canonicalName: "Table",
    language: "typescriptreact",
    content: tableFile,
  },
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function stripExtension(path: string): string {
  return normalizePath(path).replace(/\.(tsx?|jsx?)$/, "");
}

function resolveImport(fromFile: string, spec: string): string | null {
  const clean = spec.trim().replace(/\.(tsx?|jsx?)$/, "");
  if (!clean) return null;
  if (clean.startsWith("@/")) return normalizePath(`src/${clean.slice(2)}`);
  if (clean.startsWith("src/") || clean.startsWith("components/") || clean.startsWith("lib/")) {
    return normalizePath(clean);
  }
  if (!clean.startsWith(".")) return null;

  const base = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const out: string[] = [];
  for (const part of `${base}/${clean}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function addPathVariants(paths: Set<string>, path: string) {
  const clean = normalizePath(path);
  const noExt = stripExtension(clean);
  paths.add(clean);
  paths.add(noExt);
  paths.add(`${noExt}.ts`);
  paths.add(`${noExt}.tsx`);
  paths.add(`${noExt}.js`);
  paths.add(`${noExt}.jsx`);
}

function hasPath(paths: Set<string>, noExtPath: string): boolean {
  const clean = stripExtension(noExtPath);
  return (
    paths.has(clean) ||
    paths.has(`${clean}.ts`) ||
    paths.has(`${clean}.tsx`) ||
    paths.has(`${clean}.js`) ||
    paths.has(`${clean}.jsx`) ||
    paths.has(`${clean}/index.ts`) ||
    paths.has(`${clean}/index.tsx`) ||
    paths.has(`${clean}/index.js`) ||
    paths.has(`${clean}/index.jsx`)
  );
}

function findKnownFile(files: MinimalGeneratedFile[], noExtPath: string): MinimalGeneratedFile | null {
  const clean = stripExtension(noExtPath);
  return files.find((file) => {
    const path = stripExtension(file.path);
    return path === clean || path === clean.replace(/^src\//, "") || `src/${path}` === clean;
  }) ?? null;
}

function upsertSupportFile<T extends MinimalGeneratedFile>(
  out: T[],
  paths: Set<string>,
  path: string,
  language: string,
  content: string,
) {
  const clean = stripExtension(path);
  const idx = out.findIndex((file) => stripExtension(file.path) === clean);
  if (idx >= 0) {
    out[idx] = { ...out[idx], content, language: out[idx].language ?? language };
    addPathVariants(paths, out[idx].path);
    return;
  }
  out.push({ path, content, language } as T);
  addPathVariants(paths, path);
}

function importRecords(file: MinimalGeneratedFile): Array<{ clause: string; spec: string; resolved: string | null }> {
  const records: Array<{ clause: string; spec: string; resolved: string | null }> = [];
  const content = file.content ?? "";
  const fromRe = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = fromRe.exec(content)) !== null) {
    records.push({
      clause: match[1].trim(),
      spec: match[2],
      resolved: resolveImport(file.path, match[2]),
    });
  }
  const sideEffectRe = /import\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffectRe.exec(content)) !== null) {
    records.push({
      clause: "",
      spec: match[1],
      resolved: resolveImport(file.path, match[1]),
    });
  }
  return records;
}

function parseDefaultImport(clause: string): string | null {
  const clean = clause.trim();
  if (!clean || clean.startsWith("{") || clean.startsWith("*") || clean.startsWith("type {")) return null;
  const first = clean.split(",")[0]?.trim().replace(/^type\s+/, "");
  return /^[A-Za-z_$][\w$]*$/.test(first ?? "") ? first ?? null : null;
}

function parseNamedImports(clause: string): string[] {
  const match = clause.match(/\{([^}]+)\}/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((raw) => raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/i)[0]?.trim())
    .filter((name): name is string => /^[A-Za-z_$][\w$]*$/.test(name ?? ""));
}

function localBindingNames(content: string): Set<string> {
  const names = new Set<string>();
  let depth = 0;
  for (const line of content.split("\n")) {
    if (depth === 0) {
      const declaration = line.match(
        /^\s*(?:export\s+)?(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)\b/,
      );
      if (declaration?.[1]) names.add(declaration[1]);
      const defaultDeclaration = line.match(
        /^\s*export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)\b/,
      );
      if (defaultDeclaration?.[1]) names.add(defaultDeclaration[1]);
    }
    const stripped = line
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "")
      .replace(/\/\/.*$/, "");
    for (const char of stripped) {
      if (char === "{") depth++;
      else if (char === "}") depth = Math.max(0, depth - 1);
    }
  }

  for (const match of content.matchAll(/\bimport\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    const clause = match[1].trim();
    const defaultName = parseDefaultImport(clause);
    if (defaultName) names.add(defaultName);
    const namespaceName = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1];
    if (namespaceName) names.add(namespaceName);
    const named = clause.match(/\{([^}]+)\}/)?.[1] ?? "";
    for (const raw of named.split(",")) {
      const local = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/i).pop()?.trim();
      if (local && /^[A-Za-z_$][\w$]*$/.test(local)) names.add(local);
    }
  }
  return names;
}

function exportedNames(content: string): Set<string> {
  const names = new Set<string>();
  const locals = localBindingNames(content);
  for (const match of content.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)\b/g)) {
    names.add(match[1]);
  }
  for (const match of content.matchAll(/\bexport\s*\{([^}]+)\}\s*(?:from\s+['"][^'"]+['"])?/g)) {
    const reExport = /\}\s*from\s+['"]/.test(match[0]);
    for (const raw of match[1].split(",")) {
      const parts = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/i);
      const local = parts[0]?.trim();
      const exported = parts.pop()?.trim();
      if (exported && exported !== "default" && (reExport || (local && locals.has(local)))) names.add(exported);
    }
  }
  return names;
}

function normalizeTypeDefaultImports<T extends MinimalGeneratedFile>(file: T): T {
  let changed = false;
  const content = (file.content ?? "").replace(
    /import\s+(?:type\s+)?([A-Za-z_$][\w$]*)(?:\s*,\s*\{([^}]*)\})?\s+from\s+(['"])([^'"]+)\3\s*;?/g,
    (statement, defaultName: string, namedClause: string | undefined, quote: string, spec: string) => {
      const resolved = resolveImport(file.path, spec);
      if (!resolved || !isTypesPath(resolved)) return statement;
      const entries = [
        defaultName,
        ...(namedClause ?? "")
          .split(",")
          .map((entry) => entry.trim().replace(/^type\s+/, ""))
          .filter(Boolean),
      ];
      changed = true;
      return `import type { ${entries.join(", ")} } from ${quote}${spec}${quote};`;
    },
  );
  return changed ? { ...file, content } : file;
}

function normalizeGeneratedJsxExtensions<T extends MinimalGeneratedFile>(files: T[]): T[] {
  const renamed = new Map<string, string>();
  const normalized = files.map((file) => {
    const path = normalizePath(file.path);
    if (!path.endsWith(".ts") || !/<[A-Z][A-Za-z0-9]*(?:\s|>|\/>)/.test(file.content ?? "")) {
      return file;
    }
    const nextPath = `${path.slice(0, -3)}.tsx`;
    renamed.set(stripExtension(path), nextPath);
    return { ...file, path: nextPath, language: "typescriptreact" };
  });
  if (renamed.size === 0) return normalized;

  return normalized.map((file) => {
    let changed = false;
    const content = (file.content ?? "").replace(
      /(\b(?:from\s+|import\s*\(\s*)['"])([^'"]+\.ts)(['"])/g,
      (statement, prefix: string, spec: string, suffix: string) => {
        const resolved = resolveImport(file.path, spec);
        const target = resolved ? renamed.get(stripExtension(resolved)) : undefined;
        if (!target) return statement;
        changed = true;
        return `${prefix}${spec.slice(0, -3)}.tsx${suffix}`;
      },
    );
    return changed ? { ...file, content } : file;
  });
}

function pascalCase(value: string): string {
  const base = value
    .split("/")
    .pop()
    ?.replace(/\.(tsx?|jsx?)$/, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim() || "GeneratedComponent";
  const name = base
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : "GeneratedComponent";
}

function findUiSupport(resolved: string): { path: string; spec: SupportSpec } | null {
  const clean = stripExtension(resolved);
  const match = clean.match(/^(src\/)?components\/ui\/([^/]+)$/);
  if (!match) return null;
  const key = match[2].toLowerCase();
  const spec = UI_SUPPORT[key];
  if (!spec) return null;
  return { path: `${clean}.tsx`, spec };
}

function isTypesPath(resolved: string): boolean {
  const clean = stripExtension(resolved);
  return clean === "src/lib/types" || clean === "lib/types";
}

function isUtilsPath(resolved: string): boolean {
  const clean = stripExtension(resolved);
  return /(^|\/)(lib\/utils|utils)$/.test(clean);
}

function isDataPath(resolved: string): boolean {
  const clean = stripExtension(resolved);
  return /^(src\/)?data\//.test(clean);
}

function isContextPath(resolved: string): boolean {
  const clean = stripExtension(resolved);
  return /^(src\/)?(context|contexts)\//.test(clean) || /Context$/i.test(clean.split("/").pop() ?? "");
}

function isHookPath(resolved: string): boolean {
  const clean = stripExtension(resolved);
  return /^(src\/)?hooks\//.test(clean) || /^use[A-Z]/.test(clean.split("/").pop() ?? "");
}

function isLibModulePath(resolved: string): boolean {
  const clean = stripExtension(resolved);
  return /^(src\/)?lib\//.test(clean) && !isUtilsPath(clean) && !isTypesPath(clean);
}

function isComponentOrPagePath(resolved: string): boolean {
  if (isMissingComponentPath(resolved)) return true;
  // Also repair root-level UI modules like src/Button.tsx / src/Shop.tsx
  const clean = stripExtension(resolved);
  const base = clean.split("/").pop() ?? "";
  return /^(src\/)?[A-Z][\w$]*$/.test(clean) || /^[A-Z][\w$]*$/.test(base);
}

function hasDefaultExport(content: string): boolean {
  return /\bexport\s+default\b/m.test(content);
}

function appendDefaultExport(content: string, name: string): string {
  if (hasDefaultExport(content)) return content;
  const safe = /^[A-Za-z_$][\w$]*$/.test(name) ? name : "GeneratedComponent";
  // Prefer re-exporting an existing named symbol; otherwise create a tiny default.
  if (exportedNames(content).has(safe)) {
    return appendBlock(content, "// LifemarkAI generated default export", `export default ${safe};`);
  }
  return appendBlock(
    content,
    "// LifemarkAI generated default export",
    `export default function ${safe}(props) {\n  return props?.children ?? null;\n}\n`,
  );
}

/**
 * Drop bare `export { Name };` when `export function/const/class Name` already
 * exists. That combo is a Vite/esbuild "Multiple exports with the same name"
 * fatal — it often appears after converting `export default function Name` into
 * a named+default pair while a generated `export { Name }` re-export remains.
 */
function stripRedundantNamedReExports(content: string): string {
  let next = content;
  const declared = new Set<string>();
  for (const match of content.matchAll(
    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:function|const|class|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)\b/g,
  )) {
    declared.add(match[1]);
  }
  const locals = localBindingNames(content);
  next = next.replace(/(^|\n)([ \t]*)export\s*\{([^}]+)\}\s*;(?!\s*from)/g, (_statement, start: string, indent: string, list: string) => {
    const kept = list.split(",").filter((raw: string) => {
      const parts = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/i);
      const local = parts[0]?.trim();
      const exported = parts.at(-1)?.trim();
      return !!local && locals.has(local) && !!exported && !declared.has(exported);
    });
    return kept.length > 0 ? `${start}${indent}export { ${kept.map((entry: string) => entry.trim()).join(", ")} };` : start;
  });
  // Orphan comment left behind when every generated re-export was stripped.
  next = next.replace(/\n\/\/ LifemarkAI generated missing named exports\n(?!\s*export)/g, "\n");
  return next;
}

function appendNamedReExports(content: string, names: string[]): string {
  const missing = names.filter(
    (name) => /^[A-Za-z_$][\w$]*$/.test(name) && !exportedNames(content).has(name),
  );
  if (missing.length === 0) return content;

  const blockLines: string[] = [];
  for (const name of missing) {
    // Already a named declaration export — never add a second `export { Name }`.
    if (new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|class)\\s+${name}\\b`).test(content)) {
      continue;
    }
    // Default export function/const with the same name → also expose as named.
    if (
      new RegExp(`export\\s+default\\s+(?:async\\s+)?function\\s+${name}\\b`).test(content) ||
      new RegExp(`(?:function|const|class)\\s+${name}\\b`).test(content)
    ) {
      blockLines.push(`export { ${name} };`);
      continue;
    }
    // File has some default export — alias it to the requested named import,
    // but ONLY via the default's LOCAL binding name. `export { default as X }`
    // without a `from` clause is a SYNTAX ERROR ("Unexpected keyword 'default'")
    // and crashed the whole app on mount. If we can't find a local name, fall
    // through to a passthrough stub (always valid).
    const localDefault =
      content.match(/export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)?.[1] ??
      content.match(/export\s+default\s+(?:async\s+)?class\s+([A-Za-z_$][\w$]*)/)?.[1] ??
      content.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;/)?.[1] ??
      null;
    if (localDefault && localDefault !== name) {
      blockLines.push(`export { ${localDefault} as ${name} };`);
      continue;
    }
    if (localDefault === name) {
      // Default's local name already equals the requested export → nothing to add.
      continue;
    }
    if (/^[A-Z]/.test(name)) {
      blockLines.push(
        `export function ${name}(props) {\n  return props?.children ?? <div>${name}</div>;\n}`,
      );
    } else if (/^use[A-Z]/.test(name)) {
      blockLines.push(hookExport(name));
    } else {
      blockLines.push(`export const ${name} = undefined;`);
    }
  }

  const block = blockLines.join("\n\n");
  return block ? appendBlock(content, "// LifemarkAI generated missing named exports", block) : content;
}

function hookExport(name: string): string {
  if (name === "useCart") {
    return `export function useCart() {
  return {
    items: [],
    cart: [],
    addItem: () => {},
    removeItem: () => {},
    updateQty: () => {},
    clear: () => {},
    total: 0,
    count: 0,
  };
}`;
  }
  if (name === "useAuth") {
    return `export function useAuth() {
  return { user: null, session: null, loading: false, signIn: async () => ({}), signOut: async () => {} };
}`;
  }
  return `export function ${name}(..._args) {
  return {};
}`;
}

function contextExportBlock(names: string[]): string {
  const lines: string[] = [];
  const hasProvider = names.some((n) => /Provider$/i.test(n));
  const hookNames = names.filter((n) => /^use[A-Z]/.test(n));
  const providers = names.filter((n) => /Provider$/i.test(n));
  const other = names.filter((n) => !/^use[A-Z]/.test(n) && !/Provider$/i.test(n));

  if (hookNames.includes("useCart") || providers.some((p) => /Cart/i.test(p)) || other.some((n) => /Cart/i.test(n))) {
    lines.push(`import React from "react";
const CartContext = React.createContext({
  items: [],
  cart: [],
  addItem: () => {},
  removeItem: () => {},
  updateQty: () => {},
  clear: () => {},
  total: 0,
  count: 0,
});
export function CartProvider({ children }) {
  return <CartContext.Provider value={{ items: [], cart: [], addItem: () => {}, removeItem: () => {}, updateQty: () => {}, clear: () => {}, total: 0, count: 0 }}>{children}</CartContext.Provider>;
}
export function useCart() {
  return React.useContext(CartContext);
}
export { CartContext };`);
  } else {
    for (const name of providers) {
      lines.push(`export function ${name}({ children }) { return children ?? null; }`);
    }
    for (const name of hookNames) {
      lines.push(hookExport(name));
    }
    for (const name of other) {
      lines.push(`export const ${name} = {};`);
    }
  }

  if (!hasProvider && providers.length === 0 && lines.length === 0) {
    for (const name of names) {
      if (/^use[A-Z]/.test(name)) lines.push(hookExport(name));
      else if (/^[A-Z]/.test(name)) lines.push(`export function ${name}({ children }) { return children ?? null; }`);
      else lines.push(`export const ${name} = {};`);
    }
  }

  return lines.join("\n\n");
}

function appendContextExports(content: string, names: string[]): string {
  const missing = names.filter((name) => !exportedNames(content).has(name));
  if (missing.length === 0) return content;
  // If file is empty/minimal, write a coherent cart context when relevant
  if (!content.trim() || content.trim().length < 40) {
    return contextExportBlock(names);
  }
  const block = missing
    .map((name) => {
      if (/^use[A-Z]/.test(name)) return hookExport(name);
      if (/Provider$/i.test(name)) return `export function ${name}({ children }) { return children ?? null; }`;
      return `export const ${name} = {};`;
    })
    .join("\n\n");
  return appendBlock(content, "// LifemarkAI generated missing context exports", block);
}

function appendHookExports(content: string, names: string[]): string {
  const missing = names.filter((name) => !exportedNames(content).has(name));
  if (missing.length === 0) return content;
  const block = missing.map(hookExport).join("\n\n");
  return appendBlock(content, "// LifemarkAI generated missing hook exports", block);
}

function libModuleExport(name: string): string {
  if (name === "subscribeNewsletter") {
    return `export async function subscribeNewsletter(email) {
  return { ok: true, email: String(email ?? "") };
}`;
  }
  if (name === "supabase") {
    return `export const supabase = {
  auth: { getUser: async () => ({ data: { user: null }, error: null }), getSession: async () => ({ data: { session: null }, error: null }) },
  from: () => ({ select: async () => ({ data: [], error: null }), insert: async () => ({ data: null, error: null }) }),
};`;
  }
  if (/^use[A-Z]/.test(name)) return hookExport(name);
  if (/^[A-Z]/.test(name)) {
    return `export function ${name}(..._args) { return null; }`;
  }
  return `export async function ${name}(..._args) { return null; }`;
}

function appendLibExports(content: string, names: string[]): string {
  const missing = names.filter((name) => !exportedNames(content).has(name));
  if (missing.length === 0) return content;
  const block = missing.map(libModuleExport).join("\n\n");
  return appendBlock(content, "// LifemarkAI generated missing lib exports", block);
}

function isMissingComponentPath(resolved: string): boolean {
  const clean = stripExtension(resolved);
  return /^(src\/)?(components|pages|views|screens|sections|layouts|features|blocks)\//.test(clean);
}

function addSupportFile<T extends MinimalGeneratedFile>(
  out: T[],
  paths: Set<string>,
  path: string,
  language: string,
  content: string,
) {
  if (hasPath(paths, path)) return;
  out.push({ path, content, language } as T);
  addPathVariants(paths, path);
}

function collectNeededTypes(files: MinimalGeneratedFile[]): string[] {
  const names = new Set<string>();
  for (const file of files) {
    for (const record of importRecords(file)) {
      if (record.resolved !== "src/lib/types" && record.resolved !== "lib/types") continue;
      for (const name of parseNamedImports(record.clause)) names.add(name);
    }
  }
  return [...names].sort();
}

export function ensureCommonGeneratedSupportFiles<T extends MinimalGeneratedFile>(
  files: T[],
  existingFiles: MinimalGeneratedFile[] = [],
): T[] {
  const normalizedFiles = normalizeGeneratedJsxExtensions(files.map(normalizeTypeDefaultImports));
  const out = [...normalizedFiles];
  const paths = new Set<string>();
  const allInputFiles = [...existingFiles, ...normalizedFiles];
  for (const file of allInputFiles) addPathVariants(paths, file.path);

  const neededExports = new Map<string, Set<string>>();
  const defaultComponentImports = new Map<string, Set<string>>();

  for (const file of allInputFiles) {
    for (const record of importRecords(file)) {
      if (!record.resolved) continue;
      const resolved = stripExtension(record.resolved);
      const named = parseNamedImports(record.clause);
      if (named.length > 0) {
        const set = neededExports.get(resolved) ?? new Set<string>();
        for (const name of named) set.add(name);
        neededExports.set(resolved, set);
      }
      const defaultName = parseDefaultImport(record.clause);
      if (defaultName && isMissingComponentPath(resolved)) {
        const set = defaultComponentImports.get(resolved) ?? new Set<string>();
        set.add(defaultName);
        defaultComponentImports.set(resolved, set);
      }
    }
  }

  for (const file of allInputFiles) {
    for (const record of importRecords(file)) {
      if (!record.resolved) continue;
      const ui = findUiSupport(record.resolved);
      if (ui) {
        addSupportFile(out, paths, ui.path, ui.spec.language, ui.spec.content(ui.path));
        continue;
      }
      if (!hasPath(paths, record.resolved) && isMissingComponentPath(record.resolved)) {
        const clean = stripExtension(record.resolved);
        const names = new Set<string>([
          ...(defaultComponentImports.get(clean) ?? []),
          ...parseNamedImports(record.clause),
          pascalCase(clean),
        ]);
        addSupportFile(out, paths, `${clean}.tsx`, "typescriptreact", genericComponentFile(clean, [...names]));
      }
    }
  }

  const neededTypes = collectNeededTypes(allInputFiles);
  const importsTypes = neededTypes.length > 0 || allInputFiles.some((file) =>
    importRecords(file).some((record) => record.resolved === "src/lib/types" || record.resolved === "lib/types"),
  );
  if (importsTypes) {
    const typesPath = allInputFiles.some((file) =>
      importRecords(file).some((record) => record.resolved === "lib/types"),
    ) ? "lib/types.ts" : "src/lib/types.ts";
    const known = findKnownFile(allInputFiles, typesPath);
    const missing = neededTypes.filter((name) => !exportedNames(known?.content ?? "").has(name));
    if (!known || missing.length > 0) {
      const content = known
        ? appendTypeExports(known.content ?? "", missing)
        : typesFile(neededTypes);
      upsertSupportFile(out, paths, known?.path ?? typesPath, "typescript", content);
    }
  }

  for (const [resolved, namesSet] of neededExports) {
    const names = [...namesSet].sort();
    // Prefer the in-progress `out` copy so chained repairs see prior upserts.
    const known = findKnownFile(out, resolved) ?? findKnownFile(allInputFiles, resolved);
    const missing = names.filter((name) => !exportedNames(known?.content ?? "").has(name));
    if (missing.length === 0) continue;

    if (isTypesPath(resolved)) {
      const path = known?.path ?? `${resolved}.ts`;
      upsertSupportFile(out, paths, path, "typescript", known ? appendTypeExports(known.content ?? "", missing) : typesFile(names));
      continue;
    }

    if (isUtilsPath(resolved)) {
      const path = known?.path ?? `${resolved}.ts`;
      const base = known?.content ?? "";
      upsertSupportFile(out, paths, path, "typescript", appendUtilityExports(base, missing));
      continue;
    }

    if (isDataPath(resolved)) {
      const path = known?.path ?? `${resolved}.ts`;
      const base = known?.content ?? "";
      upsertSupportFile(out, paths, path, "typescript", appendDataExports(base, missing));
      continue;
    }

    if (isContextPath(resolved)) {
      const path = known?.path ?? `${resolved}.tsx`;
      const base = known?.content ?? "";
      upsertSupportFile(out, paths, path, "typescriptreact", appendContextExports(base, missing));
      continue;
    }

    if (isHookPath(resolved)) {
      const path = known?.path ?? `${resolved}.ts`;
      const base = known?.content ?? "";
      upsertSupportFile(out, paths, path, "typescript", appendHookExports(base, missing));
      continue;
    }

    if (isLibModulePath(resolved)) {
      const path = known?.path ?? `${resolved}.ts`;
      const base = known?.content ?? "";
      upsertSupportFile(out, paths, path, "typescript", appendLibExports(base, missing));
      continue;
    }

    if (isComponentOrPagePath(resolved)) {
      const path = known?.path ?? `${resolved}.tsx`;
      const base = known?.content ?? "";
      // Also ensure default import consumers work when only named exists.
      let next = appendNamedReExports(base, missing);
      const defaultImporters = defaultComponentImports.get(stripExtension(resolved));
      if (defaultImporters && defaultImporters.size > 0) {
        const primary = [...defaultImporters][0]!;
        next = appendDefaultExport(next, primary);
      }
      upsertSupportFile(out, paths, path, "typescriptreact", next);
    }
  }

  // Second pass: default-import a named-only component/page (e.g. ProductList).
  for (const file of [...allInputFiles, ...out]) {
    for (const record of importRecords(file)) {
      if (!record.resolved) continue;
      const defaultName = parseDefaultImport(record.clause);
      if (!defaultName || !isComponentOrPagePath(record.resolved)) continue;
      const known = findKnownFile(out, record.resolved) ?? findKnownFile(allInputFiles, record.resolved);
      if (!known) continue;
      if (hasDefaultExport(known.content ?? "")) continue;
      const next = appendDefaultExport(known.content ?? "", defaultName);
      upsertSupportFile(out, paths, known.path, known.language ?? "typescriptreact", next);
    }
  }

  // Final pass: remove `export { Name }` that collides with `export function Name`
  // (Vite: "Multiple exports with the same name").
  for (let i = 0; i < out.length; i++) {
    const file = out[i]!;
    const content = file.content ?? "";
    const cleaned = stripRedundantNamedReExports(content);
    if (cleaned !== content) {
      out[i] = { ...file, content: cleaned };
    }
  }

  return out;
}

function joinHelper(name = "cx") {
  return `function ${name}(...values) {
  return values.filter(Boolean).join(" ");
}`;
}

function buttonFile() {
  return `${joinHelper()}

export function Button({
  className = "",
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  ...props
}) {
  const variants = {
    primary: "bg-slate-950 text-white hover:bg-slate-800 shadow-sm",
    secondary: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50",
    ghost: "text-slate-700 hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}

export default Button;
`;
}

function cardFile() {
  return `${joinHelper()}

export function Card({ className = "", children, ...props }) {
  return <div className={cx("rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm", className)} {...props}>{children}</div>;
}

export function CardHeader({ className = "", children, ...props }) {
  return <div className={cx("space-y-1.5 p-6", className)} {...props}>{children}</div>;
}

export function CardTitle({ className = "", children, ...props }) {
  return <div className={cx("text-lg font-semibold leading-none tracking-tight", className)} {...props}>{children}</div>;
}

export function CardContent({ className = "", children, ...props }) {
  return <div className={cx("p-6 pt-0", className)} {...props}>{children}</div>;
}

export function CardFooter({ className = "", children, ...props }) {
  return <div className={cx("flex items-center p-6 pt-0", className)} {...props}>{children}</div>;
}

export default Card;
`;
}

function badgeFile() {
  return `${joinHelper()}

export function Badge({ className = "", variant = "default", children, ...props }) {
  const variants = {
    default: "bg-slate-900 text-white",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
    muted: "bg-slate-100 text-slate-600",
  };
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", variants[variant], className)} {...props}>{children}</span>;
}

export default Badge;
`;
}

function inputFile() {
  return `${joinHelper()}

export function Input({ className = "", label, error, id, ...props }) {
  const inputId = id ?? props.name;
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      <input id={inputId} className={cx("h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-950/10 transition focus:ring-4", className)} {...props} />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default Input;
`;
}

function selectFile() {
  return `${joinHelper()}

export function Select({ className = "", label, error, children, ...props }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-medium text-slate-700">{label}</span>}
      <select className={cx("h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-950/10 transition focus:ring-4", className)} {...props}>
        {children}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export default Select;
`;
}

function dialogFile() {
  return `${joinHelper()}

export function Dialog({ open = true, title, footer, onClose, className = "", children, ...props }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className={cx("w-full max-w-lg rounded-xl bg-white p-6 shadow-xl", className)} {...props}>
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="text-lg font-semibold text-slate-950">{title}</h2>}
          {onClose && <button className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100" onClick={onClose}>Close</button>}
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export default Dialog;
`;
}

function tableFile() {
  return `${joinHelper()}

export function Table({ className = "", ...props }) {
  return <table className={cx("w-full border-collapse text-sm", className)} {...props} />;
}

export function THead({ className = "", ...props }) {
  return <thead className={cx("border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500", className)} {...props} />;
}

export function TBody({ className = "", ...props }) {
  return <tbody className={cx("divide-y divide-slate-100", className)} {...props} />;
}

export function TRow({ className = "", ...props }) {
  return <tr className={cx("transition hover:bg-slate-50", className)} {...props} />;
}

export function TCell({ className = "", ...props }) {
  return <td className={cx("px-4 py-3 align-middle", className)} {...props} />;
}

export function THeaderCell({ className = "", ...props }) {
  return <th className={cx("px-4 py-3 font-medium", className)} {...props} />;
}

export default Table;
`;
}

function genericComponentFile(path: string, names: string[]) {
  const primary = pascalCase(path);
  const exportNames = [...new Set(names.filter((name) => /^[A-Z][A-Za-z0-9_$]*$/.test(name)))];
  if (!exportNames.includes(primary)) exportNames.unshift(primary);
  const aliases = exportNames
    .filter((name) => name !== primary)
    .map((name) => `export const ${name} = ${primary};`)
    .join("\n");
  const title = primary.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return `${joinHelper()}

export function ${primary}({ children, title = "${title}", ...props }) {
  return (
    <section className={cx("rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-700", props.className)}>
      {children ?? <div><h2 className="text-xl font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm">This generated section is ready to customize.</p></div>}
    </section>
  );
}

${aliases}

export default ${primary};
`;
}

function appendBlock(content: string, marker: string, block: string): string {
  if (content.includes(block.trim())) return content;
  return `${content.trimEnd()}\n\n${marker}\n${block.trim()}\n`;
}

function typeExportBlock(names: string[]): string {
  const builtIns = new Set(["EntityId", "EntityRecord", "Status", "CurrencyCode"]);
  return names
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && !builtIns.has(name))
    .map((name) => `export type ${name} = EntityRecord;\nexport const ${name} = {};`)
    .join("\n\n");
}

function appendTypeExports(content: string, names: string[]): string {
  const missing = names.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name));
  if (missing.length === 0) return content;
  const base = content.trim()
    ? content
    : `export type EntityId = string | number;
export const EntityId = "";

export type EntityRecord = Record<string, unknown>;
export const EntityRecord = {};
`;
  const block = typeExportBlock(missing);
  if (!block.trim()) return base;
  return appendBlock(base, "// LifemarkAI generated missing type/value exports", block);
}

function utilityExport(name: string): string {
  const generic = `export function ${name}(value = "") { return value == null ? "" : String(value); }`;
  const map: Record<string, string> = {
    cn: "export function cn(...values) { return values.flat(Infinity).filter(Boolean).join(\" \"); }",
    cx: "export function cx(...values) { return values.flat(Infinity).filter(Boolean).join(\" \"); }",
    formatDate: "export function formatDate(value) { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? \"\" : d.toLocaleDateString(); }",
    formatDateShort: "export function formatDateShort(value) { const d = value ? new Date(value) : new Date(); return Number.isNaN(d.getTime()) ? \"\" : d.toLocaleDateString(undefined, { month: \"short\", day: \"numeric\", year: \"numeric\" }); }",
    formatCurrency: "export function formatCurrency(value, currency = \"USD\") { const n = Number(value ?? 0); return new Intl.NumberFormat(undefined, { style: \"currency\", currency }).format(Number.isFinite(n) ? n : 0); }",
    formatPrice: "export function formatPrice(value, currency = \"USD\") { const n = Number(value ?? 0); return new Intl.NumberFormat(undefined, { style: \"currency\", currency }).format(Number.isFinite(n) ? n : 0); }",
    slugify: "export function slugify(value = \"\") { return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, \"-\").replace(/^-+|-+$/g, \"\"); }",
    capitalize: "export function capitalize(value = \"\") { const s = String(value); return s.charAt(0).toUpperCase() + s.slice(1); }",
    truncate: "export function truncate(value = \"\", length = 120) { const s = String(value); return s.length > length ? `${s.slice(0, length)}...` : s; }",
  };
  return map[name] ?? generic;
}

function appendUtilityExports(content: string, names: string[]): string {
  const block = names
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
    .map(utilityExport)
    .join("\n\n");
  return block ? appendBlock(content, "// LifemarkAI generated missing utility exports", block) : content;
}

function sampleArrayFor(name: string): string {
  if (/PRODUCT/i.test(name)) {
    return `[
  { id: "product-1", name: "Sample Product", title: "Sample Product", price: 29.99, image: "", description: "A sample product ready to customize.", category: "General" },
  { id: "product-2", name: "Featured Item", title: "Featured Item", price: 49.99, image: "", description: "Another sample product.", category: "Featured" }
]`;
  }
  if (/SERVICES?/i.test(name)) {
    return `[
  { id: "service-1", title: "Strategy", name: "Strategy", category: "Consulting", description: "A focused service ready to customize.", icon: "Sparkles" }
]`;
  }
  if (/PARTNERS?/i.test(name)) {
    return `[
  { id: "partner-1", name: "Partner", logo: "", category: "Partner", description: "Trusted partner" }
]`;
  }
  if (/PORTFOLIO|PROJECT|CASE/i.test(name)) {
    return `[
  { id: "project-1", title: "Featured Project", name: "Featured Project", category: "Work", description: "A featured project ready to customize.", image: "" }
]`;
  }
  if (/BLOG|POST|JOURNAL/i.test(name)) {
    return `[
  { id: "post-1", title: "Latest Update", slug: "latest-update", excerpt: "A generated journal entry.", date: new Date().toISOString(), category: "News" }
]`;
  }
  if (/TEAM|MEMBER/i.test(name)) {
    return `[
  { id: "member-1", name: "Team Member", role: "Founder", bio: "Profile ready to customize.", image: "" }
]`;
  }
  if (/TESTIMONIAL|REVIEW/i.test(name)) {
    return `[
  { id: "testimonial-1", name: "Customer", quote: "A thoughtful testimonial goes here.", role: "Client" }
]`;
  }
  if (/STAT|METRIC/i.test(name)) {
    return `[
  { id: "stat-1", label: "Projects", value: "100+" }
]`;
  }
  return "[]";
}

function dataExport(name: string): string {
  if (
    /^[A-Z0-9_]+S$/.test(name) ||
    /^MOCK_/i.test(name) ||
    /(LIST|ITEMS|DATA|products|PRODUCTS)$/i.test(name) ||
    /^[a-z].*s$/i.test(name)
  ) {
    return `export const ${name} = ${sampleArrayFor(name)};`;
  }
  return `export const ${name} = {};`;
}

function appendDataExports(content: string, names: string[]): string {
  const block = names
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
    .map(dataExport)
    .join("\n\n");
  return block ? appendBlock(content, "// LifemarkAI generated missing data exports", block) : content;
}

function typesFile(names: string[]) {
  const builtIns = new Set(["EntityId", "EntityRecord", "Status", "CurrencyCode"]);
  const safeNames = names.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && !builtIns.has(name));
  const dynamic = typeExportBlock(safeNames);
  return `export type EntityId = string | number;
export const EntityId = "";

export type EntityRecord = Record<string, unknown>;
export const EntityRecord = {};

export type Status = "active" | "inactive" | "pending" | "archived";
export const Status = {};

export type CurrencyCode = "USD" | "EUR" | "GBP" | "PKR";
export const CurrencyCode = "USD";

${dynamic}

const types = {};
export default types;
`;
}
