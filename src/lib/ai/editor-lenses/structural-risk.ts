import type { EditorTask } from "./types.ts";

/** Advisory only. A missing or unhealthy side service cannot block an initiative. */
export async function enrichStructuralRisk(
  tasks: EditorTask[],
  files: Map<string, string>,
  serviceUrl = process.env.LIFEMARK_RUST_AST_URL,
): Promise<void> {
  if (!serviceUrl || !tasks.length || !files.size) return;
  let bytes = 0;
  const configSource = /(?:^|\/)(?:[^/]+\.)?config\.[cm]?[jt]s$/i;
  const selected = [...files].filter(([path, content]) => {
    const size = Buffer.byteLength(content, "utf8");
    // Only supported source files. In particular, do not send .env or project
    // configuration files containing credentials to the optional service.
    if (!/\.[cm]?[jt]sx?$/.test(path) || path.includes("..") || configSource.test(path) ||
        size > 100_000 || bytes + size > 1_000_000) return false;
    bytes += size;
    return true;
  }).slice(0, 100);
  if (!selected.length) return;
  const paths = selected.map(([path]) => path);
  const relevant = tasks.map((task) => ({
    task,
    // Require a literal path from the project; guessing symbols from prose
    // produced false high-risk debates in the original PR.
    targetPaths: paths.filter((path) => {
      const text = `${task.title} ${task.acceptance ?? ""}`;
      const index = text.indexOf(path);
      if (index < 0) return false;
      const after = text[index + path.length];
      return !after || !/[\w./-]/.test(after);
    }),
  })).filter(({ targetPaths }) => targetPaths.length);
  if (!relevant.length) return;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2_000);
  try {
    const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/risk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        files: selected.map(([path, content]) => ({ path, content })),
        targets: relevant.map(({ task, targetPaths }) => ({ id: task.id, paths: targetPaths })),
      }),
      signal: abort.signal,
    });
    if (!response.ok) return;
    const result = await response.json() as { risks?: Array<{ id: string; score: number }> };
    for (const { task } of relevant) {
      const score = result.risks?.find((risk) => risk.id === task.id)?.score;
      if (typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 100) {
        task.risk = Math.max(task.risk, score);
      }
    }
  } catch {
    // Preserve the planner's risk rating when the optional service is absent.
  } finally {
    clearTimeout(timer);
  }
}
