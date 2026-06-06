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
}

/**
 * Normalise a raw parsed object into a clean ParsedAIResponse.
 */
function normalizeResponse(parsed: Record<string, unknown>): ParsedAIResponse {
  const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
  return {
    thoughts: typeof parsed.thoughts === "string" ? parsed.thoughts : undefined,
    plan: Array.isArray(parsed.plan) ? (parsed.plan as string[]) : undefined,
    files: rawFiles.map((f: unknown) => {
      const file = f as Partial<ParsedFile>;
      return {
        path: file.path ?? "",
        content: file.content ?? "",
        language: file.language ?? detectLanguage(file.path ?? ""),
      };
    }).filter((f) => f.path),
    message: typeof parsed.message === "string" ? parsed.message : "Changes applied.",
  };
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
 * fewer than 3 lines (too small to be a real file).
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
    if (body.split("\n").length < 3) continue; // too small to be a file

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

export function parseAIResponse(raw: string): ParsedAIResponse {
  const trimmed = raw.trim();

  // ── Strategy 1: clean JSON (OpenAI json_object / Anthropic prefill) ─────────
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return normalizeResponse(parsed);
    } catch {
      // Try partial-stream recovery before moving on
      const recovered = recoverPartialJSON(trimmed);
      if (recovered) {
        try {
          const parsed = JSON.parse(recovered) as Record<string, unknown>;
          return normalizeResponse(parsed);
        } catch { /* fall through */ }
      }
    }
  }

  // ── Strategy 2: ```json … ``` fence ──────────────────────────────────────────
  const jsonFence = raw.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonFence) {
    try {
      const parsed = JSON.parse(jsonFence[1]) as Record<string, unknown>;
      return normalizeResponse(parsed);
    } catch { /* fall through */ }
  }

  // ── Strategy 3: generic ``` … ``` fence ──────────────────────────────────────
  const genericFence = raw.match(/```\s*([\s\S]*?)\s*```/);
  if (genericFence) {
    try {
      const parsed = JSON.parse(genericFence[1]) as Record<string, unknown>;
      return normalizeResponse(parsed);
    } catch { /* fall through */ }
  }

  // ── Strategy 4: bracket-aware extraction ─────────────────────────────────────
  const largest = extractLargestJSON(raw);
  if (largest) {
    try {
      const parsed = JSON.parse(largest) as Record<string, unknown>;
      return normalizeResponse(parsed);
    } catch { /* fall through */ }
  }

  // ── Strategy 5: partial-stream recovery on full raw string ───────────────────
  const recovered = recoverPartialJSON(raw);
  if (recovered && recovered !== raw) {
    try {
      const parsed = JSON.parse(recovered) as Record<string, unknown>;
      return normalizeResponse(parsed);
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

  // Build a set of normalised paths for import resolution
  const normPaths = new Set<string>();
  for (const p of allPaths) {
    // strip leading ./ or src/
    normPaths.add(p);
    normPaths.add(p.replace(/^\.\//, ""));
    // also without extension
    normPaths.add(p.replace(/\.(tsx?|jsx?)$/, ""));
  }

  // Parse package.json for listed dependencies
  const pkgFile = files.find((f) => f.path === "package.json");
  let listedDeps = new Set<string>();
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      listedDeps = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
      ]);
    } catch {
      errors.push({
        type: "syntax_hint",
        file: "package.json",
        message: "package.json contains invalid JSON",
        severity: "error",
      });
    }
  }

  for (const file of files) {
    const { path: filePath, content } = file;
    const isScript = /\.(tsx?|jsx?)$/.test(filePath);
    if (!isScript) continue;

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
      }
    }

    // ── Check package imports ───────────────────────────────────────────────
    const pkgImports = [
      ...content.matchAll(/from\s+['"]([^.'"@][^'"]*)['"]/g),
      ...content.matchAll(/from\s+['"](@[^'"]+)['"]/g),
    ];

    for (const match of pkgImports) {
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

    // ── Detect truncated content ────────────────────────────────────────────
    if (
      content.includes("// ... rest") ||
      content.includes("// ...rest") ||
      content.includes("// TODO: implement") ||
      content.includes("/* ... */")
    ) {
      errors.push({
        type: "syntax_hint",
        file: filePath,
        message: "File appears truncated (contains placeholder comment)",
        severity: "warning",
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
