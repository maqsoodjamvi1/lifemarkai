import { salvageFilesFromStreamJson } from "./streaming-file-extractor";

export interface ValidationError {
  type: string;
  file?: string;
  path?: string;
  message: string;
  severity: "error" | "warning" | "info";
}

export interface ParsedFile {
  path: string;
  content: string;
  language: string;
}

export interface ParsedAIResponse {
  thoughts?: string;
  plan?: string[];
  files: ParsedFile[];
  message: string;
  error?: string;
  validationErrors?: ValidationError[];
  /**
   * True when the raw text could not be parsed as a single complete JSON object
   * and had to be recovered from a truncated stream. Signals the caller that the
   * model's output was cut off (hit max_tokens) and a continuation pass is needed
   * to get the remaining files.
   */
  truncated?: boolean;
}

/**
 * Normalise a raw parsed object into a clean ParsedAIResponse.
 */
function normalizeResponse(parsed: Record<string, unknown>, truncated = false): ParsedAIResponse {
  const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
  return {
    thoughts: typeof parsed.thoughts === "string" ? parsed.thoughts : undefined,
    plan: Array.isArray(parsed.plan) ? (parsed.plan as string[]) : undefined,
    files: rawFiles.map((f: unknown) => {
      const file = f as Partial<ParsedFile> & { name?: string };
      return {
        path: file.path ?? file.name ?? "",
        content: file.content ?? "",
        language: file.language ?? detectLanguage(file.path ?? file.name ?? ""),
      };
    }).filter((f) => f.path),
    message: typeof parsed.message === "string" ? parsed.message : "Changes applied.",
    truncated,
  };
}

/** Return normalized response only when at least one file was extracted. */
function fromParsedObject(parsed: Record<string, unknown>, truncated = false): ParsedAIResponse | null {
  const result = normalizeResponse(parsed, truncated);
  return result.files.length > 0 ? result : null;
}

/**
 * Bracket-aware JSON extractor — finds the longest top-level {...} block
 * in raw text, correctly handling nested objects and strings.
 */
function extractLargestJSON(raw: string): string | null {
  let best: string | null = null;
  let bestLen = 0;

  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== "{") continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let j = i; j < raw.length; j++) {
      const ch = raw[j];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = raw.slice(i, j + 1);
          if (candidate.length > bestLen) {
            bestLen = candidate.length;
            best = candidate;
          }
          break;
        }
      }
    }
  }

  return best;
}

/**
 * Attempt to close an unclosed JSON string produced by a truncated stream.
 * Returns a (possibly valid) closed version, or null if recovery isn't possible.
 */
function recoverPartialJSON(raw: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastClosedIdx = -1;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
        if (stack.length === 0) lastClosedIdx = i;
      }
    }
  }

  // Already had a complete JSON object somewhere
  if (lastClosedIdx > 0) return raw.slice(0, lastClosedIdx + 1);

  // Try closing the open brackets
  if (stack.length > 0) {
    // Trim trailing partial value (a comma or unclosed string makes parse fail)
    const trimmed = raw.replace(/,\s*$/, "").trimEnd();
    return trimmed + stack.reverse().join("");
  }

  return null;
}

/**
 * Parses the AI's JSON response using multiple strategies in order:
 *  1. Direct JSON.parse (clean JSON-mode response with no wrapper)
 *  2. ```json … ``` code fence
 *  3. Generic ``` … ``` code fence
 *  4. Bracket-matched largest {...} block
 *  5. Partial-stream recovery (close unclosed braces)
 *  6. Per-fenced-block extraction (rescue when AI ignored json_object)
 *
 * Falls back to treating the whole text as a conversational message.
 */

/**
 * Salvage files from a prose+fenced-block response.
 *
 * When the AI ignores the json_object instruction and replies with
 * "Here's App.jsx:" + a ```jsx fence + "And here's Login.jsx:" + another
 * fence, we extract each fence as a file. Path inference order:
 *   1. A path comment on the line BEFORE the fence ("// src/App.jsx")
 *   2. A path comment on the FIRST line of the fence ("// App.jsx")
 *   3. A derived name from the language tag ("file1.jsx", "file2.jsx")
 *
 * Returns an empty array if no fenced blocks exist OR if every block has
 * fewer than 2 non-empty lines (too small to be a real file).
 */
function extractFencesAsFiles(raw: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  // Match each ```lang\n...\n``` block, capturing language + body.
  const fenceRe = /```([a-zA-Z0-9+_-]*)\n([\s\S]*?)\n```/g;
  let match: RegExpExecArray | null;
  let derivedCounter = 1;

  while ((match = fenceRe.exec(raw)) !== null) {
    const lang = (match[1] || "").trim();
    const body = match[2] || "";
    // Single-line snippets (e.g. `x++`) are not files; real components are often 2 lines.
    if (body.trim().split("\n").filter((l) => l.trim()).length < 2) continue;

    // Look at the line immediately before the fence for a path label. Catch
    // four common shapes the AI uses to introduce a file:
    //   1. // path/to/file.ext      (JS/TS comment)
    //   2. # path/to/file.ext       (shell / Python comment)
    //   3. <!-- path/to/file.ext -->  (HTML comment)
    //   4. `path/to/file.ext`       (markdown inline code — Lovable style)
    //   5. **path/to/file.ext**     (markdown bold)
    // We also look up to TWO lines before the fence, not just one, because
    // a blank line often separates the label from the fence.
    const before = raw.slice(0, match.index);
    const last2Lines = before.split("\n").slice(-3).join("\n");
    const prevLineMatch =
      last2Lines.match(/(?:^|\n)\s*(?:\/\/|#|<!--)\s*([\w./\-]+\.\w+)\s*(?:-->)?\s*$/) ||
      last2Lines.match(/(?:^|\n)\s*`([\w./\-]+\.\w+)`\s*$/) ||
      last2Lines.match(/(?:^|\n)\s*\*\*([\w./\-]+\.\w+)\*\*\s*$/) ||
      // Bare filename on its own line ending with .tsx/.jsx/.ts/.js/.css/etc.
      last2Lines.match(/(?:^|\n)\s*([\w./\-]+\.(?:tsx?|jsx?|css|html|json|md|sql|sh|py))\s*$/);
    // Or the first line of the body itself
    const firstLine = body.split("\n", 1)[0];
    const firstLineMatch = firstLine.match(/^(?:\/\/|#|<!--)\s*([\w./\-]+\.\w+)/);

    let path: string | null = null;
    if (firstLineMatch) {
      path = firstLineMatch[1];
    } else if (prevLineMatch) {
      path = prevLineMatch[1];
    } else if (lang) {
      // Derive from language tag — best effort
      const ext = (
        { tsx: "tsx", jsx: "jsx", ts: "ts", js: "js", css: "css", html: "html", json: "json", md: "md" } as Record<string, string>
      )[lang.toLowerCase()];
      if (ext) {
        // Common Vite/React layout — put generated files under src/.
        path = `src/file${derivedCounter}.${ext}`;
        derivedCounter++;
      }
    }

    if (!path) continue;
    // Strip a leading "// path" comment from the body so it doesn't duplicate.
    const cleanedBody = firstLineMatch ? body.split("\n").slice(1).join("\n") : body;
    files.push({
      path,
      content: cleanedBody.trim(),
      language: detectLanguage(path),
    });
  }

  return files;
}

/**
 * True when a build-mode JSON response was cut off before the closing brace.
 * Drives the continuation loop in the chat route (separate from format-retry).
 */
export function needsBuildContinuation(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{") || !trimmed.includes('"files"')) return false;
  const parsed = parseAIResponse(trimmed);
  if (parsed.truncated) return true;
  try {
    JSON.parse(trimmed);
    return false;
  } catch {
    return true;
  }
}

export function parseAIResponse(raw: string): ParsedAIResponse {
  const trimmed = raw.trim();

  // ── Strategy 1: clean JSON (OpenAI json_object / Anthropic prefill) ─────────
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return normalizeResponse(parsed);
    } catch {
      const recovered = recoverPartialJSON(trimmed);
      if (recovered) {
        try {
          const parsed = JSON.parse(recovered) as Record<string, unknown>;
          const result = fromParsedObject(
            parsed,
            recovered.length < trimmed.length || recovered !== trimmed,
          );
          if (result) return result;
        } catch { /* fall through */ }
      }
    }
  }

  // ── Strategy 2: ```json … ``` fence ──────────────────────────────────────────
  const jsonFence = raw.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonFence) {
    try {
      const parsed = JSON.parse(jsonFence[1]) as Record<string, unknown>;
      const result = fromParsedObject(parsed);
      if (result) return result;
    } catch { /* fall through */ }
  }

  // ── Strategy 3: generic ``` … ``` fence ──────────────────────────────────────
  const genericFence = raw.match(/```\s*([\s\S]*?)\s*```/);
  if (genericFence) {
    try {
      const parsed = JSON.parse(genericFence[1]) as Record<string, unknown>;
      const result = fromParsedObject(parsed);
      if (result) return result;
    } catch { /* fall through */ }
  }

  // ── Strategy 4: bracket-aware extraction ─────────────────────────────────────
  const largest = extractLargestJSON(raw);
  if (largest) {
    try {
      const parsed = JSON.parse(largest) as Record<string, unknown>;
      const result = fromParsedObject(parsed);
      if (result) return result;
    } catch { /* fall through */ }
  }

  // ── Strategy 5: partial-stream recovery on full raw string ───────────────────
  const recovered = recoverPartialJSON(raw);
  if (recovered && recovered !== raw) {
    try {
      const parsed = JSON.parse(recovered) as Record<string, unknown>;
      const result = fromParsedObject(parsed, true);
      if (result) return result;
    } catch { /* fall through */ }
  }

  // ── Strategy 6: extract per-fenced-block files from prose ───────────────────
  // When the AI returns conversational prose with multiple ```lang … ``` blocks
  // instead of the JSON shape, salvage each block as a file. We infer the path
  // from a comment immediately before or inside the fence
  // (// App.jsx, /* src/Login.jsx */, # main.py), or fall back to a derived
  // name from the language tag. This rescue keeps the preview working when the
  // model ignores the json_object constraint.
  const proseFiles = extractFencesAsFiles(raw);
  if (proseFiles.length > 0) {
    // Use everything BEFORE the first fence as the conversational message.
    const firstFenceIdx = raw.search(/```/);
    const message = firstFenceIdx > 0 ? raw.slice(0, firstFenceIdx).trim() : "Generated files from your prompt.";
    return { files: proseFiles, message };
  }

  // ── Strategy 7: salvage complete file objects from truncated build JSON ─────
  // When the model hits max_tokens mid-JSON, earlier files in the "files" array
  // may be fully closed even though JSON.parse fails on the whole blob.
  if (trimmed.startsWith("{") && trimmed.includes('"files"')) {
    const salvaged = salvageFilesFromStreamJson(raw);
    if (salvaged.length > 0) {
      return {
        files: salvaged.map((f) => ({
          path: f.path,
          content: f.content,
          language: f.language || detectLanguage(f.path),
        })),
        message: "Partial build recovered — continuing generation for remaining files…",
        truncated: true,
      };
    }
  }

  // ── Fallback: treat as plain conversational message ───────────────────────────
  return {
    files: [],
    message: raw,
  };
}

/**
 * Detects language from file extension.
 */
export function detectLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescriptreact",
    js: "javascript",
    jsx: "javascriptreact",
    css: "css",
    html: "html",
    json: "json",
    md: "markdown",
    py: "python",
    sql: "sql",
    sh: "shell",
    yaml: "yaml",
    yml: "yaml",
    env: "plaintext",
  };
  return map[ext ?? ""] ?? "plaintext";
}

/**
 * Merges file changes into the existing file list.
 */
export function mergeFiles(
  existing: ParsedFile[],
  changes: ParsedFile[]
): ParsedFile[] {
  const map = new Map<string, ParsedFile>(existing.map((f) => [f.path, f]));
  for (const change of changes) {
    map.set(change.path, change);
  }
  return Array.from(map.values());
}

/**
 * Generates a simple diff summary between old and new content.
 */
export function getDiffSummary(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split("\n").length;
  const newLines = newContent.split("\n").length;
  const diff = newLines - oldLines;
  if (diff > 0) return `+${diff} lines`;
  if (diff < 0) return `${diff} lines`;
  return "modified";
}

// ─────────────────────────────────────────────────────────────────────────────
// Static validation — catch common AI generation mistakes before showing user
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_PACKAGES = new Set([
  "react", "react-dom", "react-router-dom",
  "framer-motion", "lucide-react", "clsx", "classnames",
  "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu",
  "@radix-ui/react-select", "@radix-ui/react-tabs",
  "@radix-ui/react-tooltip", "@radix-ui/react-popover",
  "@radix-ui/react-checkbox", "@radix-ui/react-radio-group",
  "@radix-ui/react-switch", "@radix-ui/react-slider",
  "@radix-ui/react-avatar", "@radix-ui/react-separator",
  "@radix-ui/react-label", "@radix-ui/react-progress",
  "react-hook-form", "@hookform/resolvers", "zod",
  "@tanstack/react-query", "date-fns",
  "recharts", "uuid", "zustand",
  "tailwindcss", "autoprefixer", "postcss",
  "vite", "@vitejs/plugin-react",
  "@types/react", "@types/react-dom", "@types/node",
  "typescript", "eslint",
]);

const REACT_HOOKS = [
  "useState",
  "useEffect",
  "useMemo",
  "useCallback",
  "useRef",
  "useReducer",
  "useContext",
  "useId",
  "useTransition",
  "useDeferredValue",
] as const;

function addPathVariants(set: Set<string>, path: string) {
  set.add(path);
  set.add(path.replace(/^\.\//, ""));
  set.add(path.replace(/^src\//, ""));
  set.add(path.replace(/\.(tsx?|jsx?)$/, ""));
  set.add(path.replace(/^src\//, "").replace(/\.(tsx?|jsx?)$/, ""));
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function buildPathIndex(files: ParsedFile[]): Map<string, ParsedFile> {
  const index = new Map<string, ParsedFile>();
  for (const file of files) {
    const path = normalizePath(file.path);
    const variants = [
      path,
      path.replace(/\.(tsx?|jsx?)$/, ""),
      path.replace(/^src\//, ""),
      path.replace(/^src\//, "").replace(/\.(tsx?|jsx?)$/, ""),
    ];
    for (const variant of variants) index.set(variant, file);
  }
  return index;
}

function resolveImportFile(pathIndex: Map<string, ParsedFile>, resolved: string): ParsedFile | null {
  const clean = normalizePath(resolved);
  const candidates = [
    clean,
    clean.replace(/\.(tsx?|jsx?)$/, ""),
    `${clean}.ts`,
    `${clean}.tsx`,
    `${clean}.js`,
    `${clean}.jsx`,
    `${clean}/index.ts`,
    `${clean}/index.tsx`,
    `${clean}/index.js`,
    `${clean}/index.jsx`,
  ];
  for (const candidate of candidates) {
    const file = pathIndex.get(candidate) ?? pathIndex.get(candidate.replace(/\.(tsx?|jsx?)$/, ""));
    if (file) return file;
  }
  return null;
}

function importedReactNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(/import\s+(?:React\s*,\s*)?\{([^}]+)\}\s+from\s+['"]react['"]/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/i)[0]?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function findDuplicateDeclarations(content: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  let depth = 0;

  for (const line of content.split("\n")) {
    const beforeDepth = depth;
    const match = line.match(/^\s*(?:export\s+)?(?:const|let|var|function|class|interface|type)\s+([A-Za-z_$][\w$]*)\b/);
    if (beforeDepth === 0 && match) {
      const name = match[1];
      if (seen.has(name)) duplicates.add(name);
      else seen.add(name);
    }

    const stripped = line
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, "")
      .replace(/\/\/.*$/, "");
    for (const ch of stripped) {
      if (ch === "{") depth++;
      else if (ch === "}") depth = Math.max(0, depth - 1);
    }
  }
  return [...duplicates];
}

function exportedNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(/\bexport\s+(?:const|let|var|function|class|interface|type)\s+([A-Za-z_$][\w$]*)\b/g)) {
    names.add(match[1]);
  }
  for (const match of content.matchAll(/\bexport\s*\{([^}]+)\}/g)) {
    for (const raw of match[1].split(",")) {
      const name = raw.trim().split(/\s+as\s+/i).pop()?.trim();
      if (name && name !== "default") names.add(name);
    }
  }
  return names;
}

function hasDefaultExport(content: string): boolean {
  return /\bexport\s+default\b/.test(content) || /\bexport\s*\{[^}]*\bas\s+default\b[^}]*\}/.test(content);
}

function parseImportClause(content: string, source: string): string | null {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`import\\s+([\\s\\S]*?)\\s+from\\s+['"]${escaped}['"]`));
  return match?.[1]?.trim() ?? null;
}

function parseNamedImports(clause: string): string[] {
  const match = clause.match(/\{([^}]+)\}/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((raw) => raw.trim().split(/\s+as\s+/i)[0]?.trim())
    .filter((name): name is string => !!name);
}

function hasDefaultImport(clause: string): boolean {
  const withoutNamed = clause.replace(/\{[^}]*\}/g, "").trim();
  return !!withoutNamed && !withoutNamed.startsWith("*") && withoutNamed !== ",";
}

function isNextServerComponent(path: string, content: string): boolean {
  if (!/(^|\/)app\/.+\.(tsx|jsx)$/.test(path)) return false;
  return !/^\s*["']use client["'];?/m.test(content);
}

function effectiveContent(files: Map<string, ParsedFile>, path: string): string {
  return files.get(path)?.content ?? "";
}

function hasRouterProvider(content: string): boolean {
  return /<\s*(BrowserRouter|HashRouter|RouterProvider)\b/.test(content) ||
    /\bcreateBrowserRouter\s*\(/.test(content);
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasRootMountTarget(html: string): boolean {
  return /<[^>]+\bid\s*=\s*["']root["'][^>]*>/i.test(html);
}

function hasMainScript(html: string): boolean {
  return /<script\b[^>]+\bsrc\s*=\s*["']\/src\/main\.(tsx|jsx|ts|js)["'][^>]*>/i.test(html);
}

function mountsReactRoot(content: string): boolean {
  return /\bcreateRoot\s*\([\s\S]*?document\.getElementById\(['"]root['"]\)[\s\S]*?\)\.render\s*\(/.test(content) ||
    /\bReactDOM\.createRoot\s*\([\s\S]*?document\.getElementById\(['"]root['"]\)[\s\S]*?\)\.render\s*\(/.test(content) ||
    /\bReactDOM\.render\s*\(/.test(content);
}

/**
 * Validate a set of generated files for common errors.
 * Returns a list of issues — empty means clean.
 */
export function validateGeneratedFiles(
  files: ParsedFile[],
  existingFiles: ParsedFile[] = []
): ValidationError[] {
  const errors: ValidationError[] = [];
  const allPaths = new Set([
    ...files.map((f) => f.path),
    ...existingFiles.map((f) => f.path),
  ]);
  const generatedPaths = new Set<string>();
  for (const file of files) {
    if (generatedPaths.has(file.path)) {
      errors.push({
        type: "duplicate_file",
        file: file.path,
        message: `Generated '${file.path}' more than once. Return one final version of each file only.`,
        severity: "error",
      });
    }
    generatedPaths.add(file.path);
  }

  // Build a set of normalised paths for import resolution
  const normPaths = new Set<string>();
  for (const p of allPaths) {
    addPathVariants(normPaths, p);
  }
  const effectiveFiles = new Map<string, ParsedFile>(existingFiles.map((f) => [f.path, f]));
  for (const file of files) effectiveFiles.set(file.path, file);
  const pathIndex = buildPathIndex([...effectiveFiles.values()]);

  // Parse package.json for listed dependencies
  const pkgFile = files.find((f) => f.path === "package.json") ??
    existingFiles.find((f) => f.path === "package.json");
  let listedDeps = new Set<string>();
  if (pkgFile) {
    try {
      const parsedPkg = JSON.parse(pkgFile.content);
      if (!isPlainObject(parsedPkg)) {
        errors.push({
          type: "invalid_package_json",
          file: "package.json",
          message: "package.json must be a JSON object.",
          severity: "error",
        });
      }
      const pkg = (isPlainObject(parsedPkg) ? parsedPkg : {}) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (pkg.dependencies && !isPlainObject(pkg.dependencies)) {
        errors.push({
          type: "invalid_package_json",
          file: "package.json",
          message: "package.json dependencies must be an object.",
          severity: "error",
        });
      }
      if (pkg.devDependencies && !isPlainObject(pkg.devDependencies)) {
        errors.push({
          type: "invalid_package_json",
          file: "package.json",
          message: "package.json devDependencies must be an object.",
          severity: "error",
        });
      }
      if (pkg.scripts && !isPlainObject(pkg.scripts)) {
        errors.push({
          type: "invalid_package_json",
          file: "package.json",
          message: "package.json scripts must be an object.",
          severity: "error",
        });
      }
      if (existingFiles.length === 0 && (!pkg.scripts || typeof pkg.scripts.dev !== "string")) {
        errors.push({
          type: "missing_dev_script",
          file: "package.json",
          message: "New Vite/React projects need a package.json scripts.dev command so the preview can start.",
          severity: "error",
        });
      }
      listedDeps = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]);
    } catch {
      errors.push({
        type: "invalid_package_json",
        file: "package.json",
        message: "package.json contains invalid JSON",
        severity: "error",
      });
    }
  }

  const tsconfigFile = files.find((f) => f.path === "tsconfig.json") ??
    existingFiles.find((f) => f.path === "tsconfig.json");
  if (tsconfigFile) {
    const parsed = parseJsonObject(tsconfigFile.content);
    if (!parsed) {
      errors.push({
        type: "invalid_tsconfig",
        file: "tsconfig.json",
        message: "tsconfig.json must be valid JSON object syntax.",
        severity: "error",
      });
    } else if (parsed.compilerOptions !== undefined && !isPlainObject(parsed.compilerOptions)) {
      errors.push({
        type: "invalid_tsconfig",
        file: "tsconfig.json",
        message: "tsconfig.json compilerOptions must be an object.",
        severity: "error",
      });
    }
  }

  for (const file of files) {
    const { path: filePath, content } = file;
    const isScript = /\.(tsx?|jsx?)$/.test(filePath);
    if (!isScript) continue;

    if (!content.trim()) {
      errors.push({
        type: "empty_file",
        file: filePath,
        message: `${filePath} is empty. Return complete file content or remove the file from the response.`,
        severity: "error",
      });
      continue;
    }

    if (/^(<<<<<<<|=======|>>>>>>>)\s/m.test(content)) {
      errors.push({
        type: "merge_conflict_marker",
        file: filePath,
        message: `${filePath} contains merge-conflict markers. Resolve them before returning the file.`,
        severity: "error",
      });
    }

    if (/\.ts$/.test(filePath) && /<[A-Z][A-Za-z0-9]*(\s|>|\/>)/.test(content)) {
      errors.push({
        type: "jsx_in_ts_file",
        file: filePath,
        message: `${filePath} contains JSX but has a .ts extension. Rename it to .tsx or remove JSX.`,
        severity: "error",
      });
    }

    // ── Check local imports ─────────────────────────────────────────────────
    const localImports = [
      ...content.matchAll(/from\s+['"](\.[^'"]+)['"]/g),
      ...content.matchAll(/import\s+['"](\.[^'"]+)['"]/g),
    ];

    for (const match of localImports) {
      const importPath = match[1];
      // Resolve relative to the importing file's directory
      const dir = filePath.includes("/") ? filePath.split("/").slice(0, -1).join("/") : "";
      const resolved = resolveRelative(dir, importPath);
      const resolvedNoExt = resolved.replace(/\.(tsx?|jsx?)$/, "");

      const found =
        normPaths.has(resolved) ||
        normPaths.has(resolved + ".ts") ||
        normPaths.has(resolved + ".tsx") ||
        normPaths.has(resolved + ".js") ||
        normPaths.has(resolved + ".jsx") ||
        normPaths.has(resolvedNoExt) ||
        normPaths.has(resolved + "/index.tsx") ||
        normPaths.has(resolved + "/index.ts");

      if (!found) {
        errors.push({
          type: "broken_import",
          file: filePath,
          message: `Imports '${importPath}' but no matching file found in generated output (resolved: ${resolved})`,
          severity: "error",
        });
      } else {
        const target = resolveImportFile(pathIndex, resolved);
        const clause = parseImportClause(content, importPath);
        if (target && clause) {
          const names = exportedNames(target.content);
          const missingNames = parseNamedImports(clause).filter((name) => !names.has(name));
          if (missingNames.length > 0) {
            errors.push({
              type: "missing_named_export",
              file: filePath,
              message: `Imports { ${missingNames.join(", ")} } from '${importPath}', but ${target.path} does not export those name(s).`,
              severity: "error",
            });
          }
          if (hasDefaultImport(clause) && !hasDefaultExport(target.content)) {
            errors.push({
              type: "missing_default_export",
              file: filePath,
              message: `Imports a default export from '${importPath}', but ${target.path} has no default export.`,
              severity: "error",
            });
          }
        }
      }
    }

    const aliasImports = [
      ...content.matchAll(/from\s+['"](@\/[^'"]+)['"]/g),
      ...content.matchAll(/import\s+['"](@\/[^'"]+)['"]/g),
    ];
    for (const match of aliasImports) {
      const importPath = match[1];
      const resolved = importPath.replace(/^@\//, "src/");
      const found =
        normPaths.has(resolved) ||
        normPaths.has(resolved + ".ts") ||
        normPaths.has(resolved + ".tsx") ||
        normPaths.has(resolved + ".js") ||
        normPaths.has(resolved + ".jsx") ||
        normPaths.has(resolved + "/index.ts") ||
        normPaths.has(resolved + "/index.tsx");

      if (!found) {
        errors.push({
          type: "broken_alias_import",
          file: filePath,
          message: `Imports '${importPath}' but no matching file exists under ${resolved}`,
          severity: "error",
        });
      } else {
        const target = resolveImportFile(pathIndex, resolved);
        const clause = parseImportClause(content, importPath);
        if (target && clause) {
          const names = exportedNames(target.content);
          const missingNames = parseNamedImports(clause).filter((name) => !names.has(name));
          if (missingNames.length > 0) {
            errors.push({
              type: "missing_named_export",
              file: filePath,
              message: `Imports { ${missingNames.join(", ")} } from '${importPath}', but ${target.path} does not export those name(s).`,
              severity: "error",
            });
          }
          if (hasDefaultImport(clause) && !hasDefaultExport(target.content)) {
            errors.push({
              type: "missing_default_export",
              file: filePath,
              message: `Imports a default export from '${importPath}', but ${target.path} has no default export.`,
              severity: "error",
            });
          }
        }
      }
    }

    // ── Check package imports ───────────────────────────────────────────────
    const pkgImports = [
      ...content.matchAll(/from\s+['"]([^.'"@][^'"]*)['"]/g),
      ...content.matchAll(/from\s+['"](@[^'"]+)['"]/g),
    ];

    for (const match of pkgImports) {
      if (match[1].startsWith("@/")) continue;
      const pkg = match[1].split("/").slice(0, match[1].startsWith("@") ? 2 : 1).join("/");
      if (
        pkg === "react" || pkg === "react-dom" || // always available
        listedDeps.has(pkg) ||
        KNOWN_PACKAGES.has(pkg)
      ) continue;

      errors.push({
        type: "missing_package",
        file: filePath,
        message: `Imports '${pkg}' which is not in package.json dependencies`,
        severity: "error",
      });
    }

    const namedReactImports = importedReactNames(content);
    const missingHooks = REACT_HOOKS.filter((hook) => {
      const usesBareHook = new RegExp(`\\b${hook}\\s*\\(`).test(content);
      const usesNamespacedHook = new RegExp(`\\bReact\\.${hook}\\s*\\(`).test(content);
      return usesBareHook && !usesNamespacedHook && !namedReactImports.has(hook);
    });
    if (missingHooks.length > 0) {
      errors.push({
        type: "missing_react_hook_import",
        file: filePath,
        message: `Uses ${missingHooks.join(", ")} but does not import them from react.`,
        severity: "error",
      });
    }

    const duplicateDeclarations = findDuplicateDeclarations(content);
    if (duplicateDeclarations.length > 0) {
      errors.push({
        type: "duplicate_declaration",
        file: filePath,
        message: `Duplicate declaration(s) in ${filePath}: ${duplicateDeclarations.slice(0, 6).join(", ")}. Keep one definition or rename scoped values.`,
        severity: "error",
      });
    }

    if (isNextServerComponent(filePath, content)) {
      const usesClientOnlyReact = REACT_HOOKS.some((hook) => new RegExp(`\\b(?:React\\.)?${hook}\\s*\\(`).test(content));
      const usesBrowserGlobals = /\b(window|document|localStorage|sessionStorage|navigator)\b/.test(content);
      const usesEventHandlers = /\bon[A-Z][A-Za-z]*=/.test(content);
      if (usesClientOnlyReact || usesBrowserGlobals || usesEventHandlers) {
        errors.push({
          type: "missing_use_client",
          file: filePath,
          message: `${filePath} uses client-only React/browser features but is a Next.js server component. Add "use client" or move the interactive code into a client component.`,
          severity: "error",
        });
      }
    }

    // ── Detect truncated content ────────────────────────────────────────────
    if (
      content.includes("// ... rest") ||
      content.includes("// ...rest") ||
      content.includes("// TODO: implement") ||
      content.includes("TODO: wire") ||
      content.includes("throw new Error(\"Not implemented") ||
      content.includes("/* ... */")
    ) {
      errors.push({
        type: "syntax_hint",
        file: filePath,
        message: "File appears unfinished (contains TODO, placeholder, or truncated implementation)",
        severity: "error",
      });
    }
  }

  // ── Entry file required whenever we emit React/TSX ───────────────────────
  const hasReactCode = files.some(
    (f) => /\.(tsx|jsx)$/.test(f.path) && !/(^|\/)[\w.-]*\.config\.(t|j)sx?$/.test(f.path)
  );
  if (hasReactCode) {
    const hasEntry = [...allPaths].some(
      (p) =>
        /(^|\/)App\.(tsx|jsx)$/.test(p) ||
        p === "src/main.tsx" ||
        p === "src/main.jsx" ||
        p === "main.tsx"
    );
    if (!hasEntry) {
      errors.push({
        type: "missing_entry",
        message:
          "No App.tsx or src/main.tsx entry file — preview will be blank. Include a default-exported App component.",
        severity: "error",
      });
    }

    const effectiveIndex = effectiveContent(effectiveFiles, "index.html");
    if (effectiveIndex) {
      if (!hasRootMountTarget(effectiveIndex)) {
        errors.push({
          type: "missing_root_mount",
          file: "index.html",
          message: "index.html is missing <div id=\"root\"></div>, so React has nowhere to mount.",
          severity: "error",
        });
      }
      if (!hasMainScript(effectiveIndex)) {
        errors.push({
          type: "missing_main_script",
          file: "index.html",
          message: "index.html must load the app entry with <script type=\"module\" src=\"/src/main.tsx\"></script>.",
          severity: "error",
        });
      }
    }

    const effectiveMainForMount =
      effectiveContent(effectiveFiles, "src/main.tsx") ||
      effectiveContent(effectiveFiles, "src/main.jsx") ||
      effectiveContent(effectiveFiles, "main.tsx");
    if (
      effectiveMainForMount &&
      /from\s+['"]react-dom\/client['"]|ReactDOM/.test(effectiveMainForMount) &&
      !mountsReactRoot(effectiveMainForMount)
    ) {
      errors.push({
        type: "missing_react_mount",
        file: "src/main.tsx",
        message: "React entry imports ReactDOM/createRoot but never renders into #root.",
        severity: "error",
      });
    }

    // Catch a generation that "succeeded" structurally but left the entry as the
    // default scaffold placeholder — i.e. the real UI was never produced (often
    // because the response was truncated and App.tsx dropped). The effective App
    // is the newly-generated one if present, else the existing file.
    const effectiveApp =
      files.find((f) => /(^|\/)App\.(tsx|jsx)$/.test(f.path)) ??
      existingFiles.find((f) => /(^|\/)App\.(tsx|jsx)$/.test(f.path));
    if (
      effectiveApp &&
      /Start chatting with AI to build it|Your app is ready\./i.test(effectiveApp.content)
    ) {
      errors.push({
        type: "placeholder_entry",
        file: effectiveApp.path,
        message:
          "App entry is still the starter placeholder — the requested UI was not generated (the response may have been truncated). Generate the real App component and its imported pages/components.",
        severity: "error",
      });
    }

    const effectiveMain =
      effectiveContent(effectiveFiles, "src/main.tsx") ||
      effectiveContent(effectiveFiles, "src/main.jsx") ||
      effectiveContent(effectiveFiles, "main.tsx");
    const effectiveContents = [...effectiveFiles.values()].map((f) => f.content).join("\n");
    const usesReactRouter =
      /from\s+['"]react-router-dom['"]/.test(effectiveContents) &&
      /\b(Routes|Route|Link|NavLink|Navigate|Outlet|useNavigate|useLocation|useParams)\b/.test(effectiveContents);
    if (usesReactRouter && !hasRouterProvider(effectiveMain) && !(effectiveApp && hasRouterProvider(effectiveApp.content))) {
      errors.push({
        type: "missing_router_provider",
        file: effectiveMain ? "src/main.tsx" : effectiveApp?.path,
        message: "react-router-dom components/hooks are used, but no BrowserRouter/RouterProvider wraps the app. Add the router provider at the entry point.",
        severity: "error",
      });
    }
  }

  // ── Check for required config files (new project) ─────────────────────────
  const isNewProject = existingFiles.length === 0;
  if (isNewProject) {
    const required = [
      "index.html", "vite.config.ts", "tsconfig.json",
      "package.json", "src/main.tsx", "src/App.tsx",
    ];
    for (const req of required) {
      if (!allPaths.has(req)) {
        errors.push({
          type: "missing_config",
          file: req,
          message: `Required file '${req}' is missing from generated output`,
          severity: "error",
        });
      }
    }
  }

  return errors;
}

/**
 * Type-agnostic GENERATION QUALITY gate.
 *
 * validateGeneratedFiles catches *correctness* (broken imports, missing config).
 * This catches *thinness* — a build that is structurally valid but too sparse to
 * be a real app (the "header + footer + two lines" failure). It measures the
 * effective result (new files merged over existing) against the app type's
 * expected size, and returns error-severity issues so the existing auto-fix /
 * enrichment loop kicks in. Works for every app type, not just one.
 */
export function assessGenerationQuality(
  files: ParsedFile[],
  existingFiles: ParsedFile[] = [],
  opts: { minFiles?: number; appType?: string } = {}
): ValidationError[] {
  const errors: ValidationError[] = [];
  const minFiles = opts.minFiles ?? 10;

  // Effective file set = existing files with this build's files layered on top.
  const byPath = new Map<string, ParsedFile>(existingFiles.map((f) => [f.path, f]));
  for (const f of files) byPath.set(f.path, f);
  const all = [...byPath.values()];
  const paths = new Set(all.map((f) => f.path));
  const appType = opts.appType;

  // 1. Too few files overall — likely only the scaffold landed.
  if (all.length < minFiles) {
    errors.push({
      type: "too_thin_filecount",
      message: `Only ${all.length} files generated, but a complete app of this type needs at least ${minFiles}. Generate the missing feature components, pages, hooks, and data per the blueprint — keep all existing files.`,
      severity: "error",
    });
  }

  // 2. Too few feature components (excluding the ui/ primitive kit).
  const featureComponents = all.filter(
    (f) => /(^|\/)src\/components\//.test("/" + f.path) && !/\/components\/ui\//.test("/" + f.path)
  );
  if (minFiles >= 12 && featureComponents.length < 3) {
    errors.push({
      type: "too_few_components",
      message: `Only ${featureComponents.length} feature component(s) under src/components/. Break the UI into the sections/cards/panels the blueprint calls for (header, hero, cards, etc.).`,
      severity: "error",
    });
  }

  // 3. Sparse main page — the entry/home page is just a heading and a line.
  // Prefer a real Home page; else the largest page file; fall back to App.tsx
  // ONLY when there are no page files (i.e. App.tsx truly is the whole app).
  // A short App.tsx that just wires a router to real pages is correct, not sparse.
  const pageFiles = all.filter((f) => /(^|\/)src\/pages\//.test("/" + f.path));
  const homePage = all.find((f) => /(^|\/)pages\/Home\.(tsx|jsx)$/.test(f.path));
  const appFile = all.find((f) => /(^|\/)App\.(tsx|jsx)$/.test(f.path));
  const main =
    homePage ??
    (pageFiles.length > 0
      ? pageFiles.reduce((a, b) => (a.content.length >= b.content.length ? a : b))
      : appFile);
  const appIsRouterOnly = main === appFile && pageFiles.length > 0;
  if (main && !appIsRouterOnly) {
    const sections = (main.content.match(/<section\b/gi) ?? []).length;
    const jsxTags = (main.content.match(/<[A-Za-z]/g) ?? []).length;
    // A page is rich enough if it has several sections, OR lots of markup, OR is
    // substantial in size. Flag only when it fails ALL three (a heading + a line).
    const looksRich = sections >= 3 || jsxTags >= 25 || main.content.length >= 1500;
    if (!looksRich) {
      errors.push({
        type: "sparse_main_page",
        file: main.path,
        message: `${main.path} is too sparse — a landing/home/storefront page must have 5+ content-rich sections (hero, grids of 8+ items, value props, footer), not a heading and a sentence.`,
        severity: "error",
      });
    }
  }

  const pageCount = all.filter((f) => /(^|\/)src\/pages\/.+\.(tsx|jsx)$/.test(f.path)).length;
  const hasSupabaseMigration = all.some((f) => /^supabase\/migrations\/.+\.sql$/.test(f.path));
  const hasSupabaseClient = paths.has("src/lib/supabase.ts") || paths.has("src/lib/supabase.tsx");
  const hasDataLayer = all.some((f) =>
    /^src\/(lib|hooks)\//.test(f.path) &&
    /(api|data-source|repository|service|store-api|erp-api|use[A-Z])/.test(f.path) &&
    /(supabase|fallback|seed|local)/i.test(f.content)
  );

  if (appType === "marketing-website") {
    if (pageCount < 5) {
      errors.push({
        type: "too_few_website_pages",
        message: `Only ${pageCount} routed page file(s) found. A complete website needs 5-10 linked pages such as Home, Services, About, Portfolio/Case Studies, Blog/Resources, and Contact.`,
        severity: "error",
      });
    }
    if (!hasSupabaseMigration || !hasSupabaseClient || !hasDataLayer) {
      errors.push({
        type: "missing_website_data_backing",
        message: "Website builds must include Supabase migration SQL, src/lib/supabase.ts, and a data-access layer/hooks with local fallback data for leads/contact/newsletter/content.",
        severity: "error",
      });
    }
  }

  if (appType === "ecommerce") {
    if (pageCount < 8) {
      errors.push({
        type: "too_few_ecommerce_pages",
        message: `Only ${pageCount} routed page file(s) found. E-commerce builds need storefront, shop, product detail, cart, checkout, account/orders, admin products, and admin orders pages.`,
        severity: "error",
      });
    }
    const schemaText = all.filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f.path)).map((f) => f.content).join("\n").toLowerCase();
    const requiredTables = ["products", "categories", "customers", "orders", "order_items"];
    const missingTables = requiredTables.filter((table) => !schemaText.includes(table));
    if (!hasSupabaseMigration || !hasSupabaseClient || !hasDataLayer || missingTables.length > 0) {
      errors.push({
        type: "missing_ecommerce_data_backing",
        message: `E-commerce builds must include Supabase schema/client/data layer for catalog, customers, orders, and inventory. Missing evidence for: ${missingTables.length ? missingTables.join(", ") : "data layer or migration files"}.`,
        severity: "error",
      });
    }
  }

  if (appType === "erp") {
    if (pageCount < 8) {
      errors.push({
        type: "too_few_erp_modules",
        message: `Only ${pageCount} routed page file(s) found. ERP builds need 8-10 operations modules such as dashboard, inventory, sales/orders, purchasing, customers, HR, reports, finance, audit log, and settings.`,
        severity: "error",
      });
    }
    const schemaText = all.filter((f) => /^supabase\/migrations\/.+\.sql$/.test(f.path)).map((f) => f.content).join("\n").toLowerCase();
    const requiredTables = ["companies", "products", "inventory", "suppliers", "purchase_orders", "customers", "sales_orders", "invoices", "employees", "audit_logs"];
    const missingTables = requiredTables.filter((table) => !schemaText.includes(table));
    if (!hasSupabaseMigration || !hasSupabaseClient || !hasDataLayer || missingTables.length > 0) {
      errors.push({
        type: "missing_erp_data_backing",
        message: `ERP builds must include Supabase schema/client/data layer for company-scoped operations, roles, inventory, orders, invoices, employees, and audit logs. Missing evidence for: ${missingTables.length ? missingTables.join(", ") : "data layer or migration files"}.`,
        severity: "error",
      });
    }
  }

  return errors;
}

/** Resolve a relative import path from a directory */
function resolveRelative(dir: string, importPath: string): string {
  const parts = [...(dir ? dir.split("/") : []), ...importPath.split("/")];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") resolved.pop();
    else if (part !== ".") resolved.push(part);
  }
  return resolved.join("/");
}

/** Returns true if the errors are severe enough to warrant an auto-fix pass */
export function shouldAutoFix(errors: ValidationError[]): boolean {
  return errors.some((e) => e.severity === "error");
}
