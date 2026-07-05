/**
 * Intelligent file selection ("hydration" — Lovable's #1 cost/quality lever).
 *
 * Feeding the whole project into the builder is expensive (a 44-file / ~157k-token
 * request can cost ~$2) AND lowers quality — models get "more stupid" with too
 * much irrelevant context. Instead, a FAST CHEAP model reads a paths-only
 * manifest and picks the files relevant to the request; only those go to the
 * builder. Robust: heuristic fallback + always-include entries + hard budgets,
 * and small projects skip selection entirely.
 */
import { generateAI } from "./generate";
import { getFastAiModel } from "./model-defaults";

export interface FileRef {
  path: string;
  content: string;
}

const ENTRY_RE =
  /(^|\/)(App|main|index|page|layout|routes?)\.(tsx?|jsx?)$|(^|\/)index\.html$|(^|\/)src\/(App|main)\.(tsx?|jsx?)$/i;

/** Heuristic relevance: entry files, the active file, and files whose name the prompt mentions. */
function heuristicSelect(prompt: string, files: FileRef[], activeFile?: string): Set<string> {
  const picked = new Set<string>();
  const p = (prompt ?? "").toLowerCase();
  for (const f of files) {
    if (ENTRY_RE.test(f.path)) picked.add(f.path);
    const base = (f.path.split("/").pop() ?? "").replace(/\.\w+$/, "").toLowerCase();
    if (base.length >= 3 && p.includes(base)) picked.add(f.path); // prompt names the component
  }
  if (activeFile) picked.add(activeFile);
  return picked;
}

function parsePathArray(raw: string): string[] {
  const m = (raw ?? "").replace(/^```json\s*|\s*```$/g, "").match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface SelectFilesOpts {
  prompt: string;
  files: FileRef[];
  activeFile?: string | null;
  /** Max files to include (default 12). */
  maxFiles?: number;
  /** Max total content chars across selected files (default 60k ≈ ~15k tokens). */
  maxChars?: number;
  /** Below this file count, skip selection and return everything (default 6). */
  smallProjectFiles?: number;
}

/**
 * Return the subset of files relevant to the prompt. Falls back to heuristics and
 * never returns empty. Small projects (or already-small total context) pass
 * through unchanged.
 */
export async function selectRelevantFiles(opts: SelectFilesOpts): Promise<FileRef[]> {
  const files = opts.files ?? [];
  const maxFiles = opts.maxFiles ?? 12;
  const maxChars = opts.maxChars ?? 60_000;
  const smallProject = opts.smallProjectFiles ?? 6;

  const total = files.reduce((n, f) => n + (f.content?.length ?? 0), 0);
  if (files.length <= smallProject || total <= maxChars) return files;

  const chosen = new Set<string>();

  // 1. Fast/cheap model picks relevant paths from a paths-only manifest (tiny tokens).
  try {
    const manifest = files
      .map((f) => `- ${f.path} (${Math.round((f.content?.length ?? 0) / 100) / 10}k)`)
      .join("\n");
    const res = await generateAI({
      model: getFastAiModel(),
      messages: [
        {
          role: "system",
          content:
            "You pick which project files are relevant to a coding request. Return ONLY a JSON array of file-path strings, most-relevant first, at most " +
            maxFiles +
            ". Include files that must be read or edited to fulfil the request, plus entry files. No prose, no markdown.",
        },
        {
          role: "user",
          content: `Request:\n${(opts.prompt ?? "").slice(0, 1500)}\n\nProject files:\n${manifest}\n\nReturn the JSON array of relevant paths.`,
        },
      ],
      maxTokens: 400,
      temperature: 0,
      jsonMode: true,
    });
    for (const p of parsePathArray(res?.content ?? "")) chosen.add(p);
  } catch {
    /* fall back to heuristics only */
  }

  // 2. Always merge in heuristics (entries, active file, prompt-named components).
  for (const p of heuristicSelect(opts.prompt ?? "", files, opts.activeFile ?? undefined)) chosen.add(p);

  // 3. Resolve to real files under the budgets.
  const byPath = new Map(files.map((f) => [f.path, f]));
  const out: FileRef[] = [];
  let used = 0;
  for (const path of chosen) {
    const f = byPath.get(path);
    if (!f) continue;
    const len = f.content?.length ?? 0;
    if (out.length >= maxFiles || used + len > maxChars) continue;
    out.push(f);
    used += len;
  }

  // Never send nothing — fall back to entries or the first few files.
  if (out.length === 0) {
    const entries = files.filter((f) => ENTRY_RE.test(f.path));
    return (entries.length ? entries : files).slice(0, smallProject);
  }
  return out;
}
