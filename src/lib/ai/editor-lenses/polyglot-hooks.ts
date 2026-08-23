/**
 * Polyglot hooks for the editor-intelligence orchestrator.
 * Optional: if Rust/Python services are down, all helpers no-op safely.
 */
import {
  buildStructuralContext,
  impactAnalysis,
  indexFiles,
  planWithPythonAgent,
} from "../../intelligence/polyglot-bridge.ts";
import type { EditorTask } from "./types.ts";

export async function tryPythonPlan(
  goal: string,
  filePaths: string[],
): Promise<{ steps: Array<{ id: string; title: string; role?: string; risk?: number }>; planner: string } | null> {
  return planWithPythonAgent(goal, { files: filePaths });
}

/** Raise task.risk from Rust impact analysis so high-blast-radius edits debate. */
export async function enrichTasksWithAstRisk(
  tasks: EditorTask[],
  files: Map<string, string>,
): Promise<void> {
  const list = [...files.entries()].map(([path, content]) => ({ path, content }));
  await indexFiles(list);
  for (const task of tasks) {
    const tokens = (task.title + " " + (task.acceptance ?? ""))
      .split(/[^A-Za-z0-9_]+/)
      .filter((t) => t.length > 2)
      .slice(0, 8);
    let maxRisk = task.risk ?? 0;
    for (const tok of tokens) {
      const impact = await impactAnalysis(tok);
      if (impact && impact.riskScore > maxRisk) maxRisk = impact.riskScore;
    }
    task.risk = maxRisk;
  }
}

export async function structuralContextForPrompt(
  files: Map<string, string>,
  symbols: string[],
): Promise<string> {
  return buildStructuralContext(files, symbols);
}
