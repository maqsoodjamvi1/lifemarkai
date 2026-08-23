/**
 * Polyglot intelligence bridge - Node (orchestration) <-> Python (AI/RAG/agents)
 * <-> Rust (AST index / structural code intelligence).
 *
 * Goal: make LifemarkAI editor intelligence deeper than pure LLM chat
 * (Lovable-style) by feeding structured facts (call graphs, type info,
 * impact analysis) into the lens orchestrator.
 *
 * All calls are optional: if the external services are down or env vars
 * unset, callers fall back to LLM-only behavior. Never blocks builds.
 */

export type AstSymbolKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "variable"
  | "import"
  | "export"
  | "unknown";

export interface AstSymbol {
  name: string;
  kind: AstSymbolKind;
  file: string;
  line: number;
  endLine?: number;
  signature?: string;
}

export interface CallEdge {
  from: string;
  to: string;
  file: string;
  line: number;
}

export interface ImpactReport {
  symbol: string;
  directCallers: string[];
  transitiveCallers: string[];
  filesAffected: string[];
  riskScore: number;
}

export interface SemanticHit {
  file: string;
  startLine: number;
  endLine: number;
  snippet: string;
  score: number;
}

export interface PlanStep {
  id: string;
  title: string;
  role?: string;
  risk?: number;
}

export interface PolyglotConfig {
  rustAstUrl?: string;
  pythonAiUrl?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT = 8_000;

function envConfig(): PolyglotConfig {
  return {
    rustAstUrl: process.env.LIFEMARK_RUST_AST_URL,
    pythonAiUrl: process.env.LIFEMARK_PYTHON_AI_URL,
    timeoutMs: Number(process.env.LIFEMARK_POLYGLOT_TIMEOUT_MS ?? DEFAULT_TIMEOUT),
  };
}

async function fetchJson<T>(
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGet<T>(url: string, timeoutMs: number): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Index a batch of files into the Rust AST service (merge mode). */
export async function indexFiles(
  files: Array<{ path: string; content: string; language?: string }>,
  cfg: PolyglotConfig = envConfig(),
): Promise<{ indexed: number; symbols: number } | null> {
  if (!cfg.rustAstUrl || files.length === 0) return null;
  return fetchJson(
    `${cfg.rustAstUrl}/index`,
    { files },
    cfg.timeoutMs ?? DEFAULT_TIMEOUT,
  );
}

/** Resolve a symbol definition via the Rust AST service. */
export async function findDefinition(
  symbol: string,
  cfg: PolyglotConfig = envConfig(),
): Promise<AstSymbol | null> {
  if (!cfg.rustAstUrl) return null;
  return fetchJson(`${cfg.rustAstUrl}/definition`, { symbol }, cfg.timeoutMs ?? DEFAULT_TIMEOUT);
}

/** Find callers of a symbol. */
export async function findCallers(
  symbol: string,
  cfg: PolyglotConfig = envConfig(),
): Promise<CallEdge[] | null> {
  if (!cfg.rustAstUrl) return null;
  const res = await fetchJson<{ callers: CallEdge[] }>(
    `${cfg.rustAstUrl}/callers`,
    { symbol },
    cfg.timeoutMs ?? DEFAULT_TIMEOUT,
  );
  return res?.callers ?? null;
}

/** Impact analysis for a symbol (callers + files + risk score). */
export async function impactAnalysis(
  symbol: string,
  cfg: PolyglotConfig = envConfig(),
): Promise<ImpactReport | null> {
  if (!cfg.rustAstUrl) return null;
  const raw = await fetchJson<Record<string, unknown>>(
    `${cfg.rustAstUrl}/impact`,
    { symbol },
    cfg.timeoutMs ?? DEFAULT_TIMEOUT,
  );
  if (!raw) return null;
  return {
    symbol: String(raw.symbol ?? symbol),
    directCallers: (raw.directCallers ?? raw.direct_callers ?? []) as string[],
    transitiveCallers: (raw.transitiveCallers ?? raw.transitive_callers ?? []) as string[],
    filesAffected: (raw.filesAffected ?? raw.files_affected ?? []) as string[],
    riskScore: Number(raw.riskScore ?? raw.risk_score ?? 0),
  };
}

/** Embedding-based semantic search over the codebase (Python service). */
export async function semanticSearch(
  query: string,
  opts: { topK?: number; projectId?: string } = {},
  cfg: PolyglotConfig = envConfig(),
): Promise<SemanticHit[] | null> {
  if (!cfg.pythonAiUrl) return null;
  const res = await fetchJson<{ hits: SemanticHit[] }>(
    `${cfg.pythonAiUrl}/semantic-search`,
    { query, top_k: opts.topK ?? 8, project_id: opts.projectId },
    cfg.timeoutMs ?? DEFAULT_TIMEOUT,
  );
  return res?.hits ?? null;
}

/** Ask the Python agent for a structured multi-step plan. */
export async function planWithPythonAgent(
  goal: string,
  context: Record<string, unknown> = {},
  cfg: PolyglotConfig = envConfig(),
): Promise<{ steps: PlanStep[]; planner: string } | null> {
  if (!cfg.pythonAiUrl) return null;
  return fetchJson(
    `${cfg.pythonAiUrl}/plan`,
    { goal, context },
    cfg.timeoutMs ?? DEFAULT_TIMEOUT,
  );
}

/**
 * Build a compact structural context string for LLM prompts:
 * index files, then summarize impact of key symbols.
 */
export async function buildStructuralContext(
  files: Map<string, string> | Array<{ path: string; content: string }>,
  symbols: string[] = [],
  cfg: PolyglotConfig = envConfig(),
): Promise<string> {
  const list = Array.isArray(files)
    ? files
    : [...files.entries()].map(([path, content]) => ({ path, content }));

  await indexFiles(list, cfg);

  const snippets: string[] = [];
  for (const sym of symbols.slice(0, 12)) {
    const impact = await impactAnalysis(sym, cfg);
    if (impact) {
      snippets.push(
        `Impact of changing \`${sym}\`: risk=${impact.riskScore}, ` +
          `callers=${impact.directCallers.slice(0, 5).join(", ") || "none"}, ` +
          `files=${impact.filesAffected.slice(0, 5).join(", ")}`,
      );
    }
  }
  return snippets.join("\n");
}

/** Health check for both side services (for editor intelligence console). */
export async function polyglotHealth(
  cfg: PolyglotConfig = envConfig(),
): Promise<{ rust: boolean; python: boolean }> {
  const timeout = 2_000;
  const rust = cfg.rustAstUrl
    ? (await fetchGet(`${cfg.rustAstUrl}/health`, timeout)) !== null
    : false;
  const python = cfg.pythonAiUrl
    ? (await fetchGet(`${cfg.pythonAiUrl}/health`, timeout)) !== null
    : false;
  return { rust, python };
}
