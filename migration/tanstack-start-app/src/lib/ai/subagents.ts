/**
 * Keyword-scored codebase scan run before a large build.
 *
 * WHAT THIS IS NOT. It was described as "Lovable-style parallel read-only
 * investigations" and surfaced in chat as an investigation with a 3/3 progress
 * counter, which read as three agents working concurrently. It is none of those
 * things: this module contains no `await`, makes no model call, and spawns nothing.
 * It tokenises the prompt, scores files already loaded in memory by keyword
 * overlap, and returns the top matches plus a few canned step titles so the UI has
 * something to show while the real build starts.
 *
 * That is genuinely useful — it is how relevant files reach the prompt — but it is
 * a ranking function, and calling it an agent invented capability the product does
 * not have. The names below are kept (they are the established internal vocabulary
 * and the SSE field name is a client/server contract) while every claim of
 * parallelism or agency has been removed from the comments and the UI copy.
 *
 * If real parallel read-only agents are wanted later, that is a new feature with a
 * real cost: N extra model calls per build. It should be a deliberate, priced
 * decision, not something implied by a label.
 */

import type { EditorMode } from "@/components/editor/editor-layout";

export type SubagentStatus = "running" | "done" | "error";

export interface SubagentStep {
  id: string;
  title: string;
  type: "explore" | "generic";
  status: SubagentStatus;
  filesInspected?: string[];
  finding?: string;
  /**
   * True when this step came from a REAL model-backed subagent
   * (`subagents-parallel.ts`), false/absent for the deterministic keyword scan in
   * this file. The UI reads it to choose between "Investigating" and "Scanning" —
   * without it the card would have to guess, and guessing is how the original
   * "3 subagents ran" fiction happened.
   */
  agent?: boolean;
}

const EXPLORE_TRIGGERS =
  /\b(subagent|explore|investigate|how does|how do|where is|where are|why does|why is|research|inspect|walk me through|structure of)\b/i;

/** Should the prompt get a keyword-scored file scan before building? */
export function shouldUseSubagents(
  message: string,
  mode: EditorMode | string,
  fileCount: number,
): boolean {
  if (mode !== "build" && mode !== "agent") return false;
  if (EXPLORE_TRIGGERS.test(message)) return true;
  // Large projects benefit from investigation even with short prompts
  if (fileCount >= 8) return true;
  if (fileCount >= 5 && message.length >= 40) return true;
  return false;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function scoreFile(
  path: string,
  content: string,
  keywords: string[],
): number {
  const pathLower = path.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (pathLower.includes(kw)) score += 4;
    if (content.toLowerCase().includes(kw)) score += 1;
  }
  if (/app\/page|App\.tsx|main\.tsx|index\.html/i.test(path)) score += 2;
  return score;
}

function buildTasks(message: string): SubagentStep[] {
  const tasks: SubagentStep[] = [];

  if (/\bauth|login|signup|session|oauth\b/i.test(message)) {
    tasks.push({
      id: "sa-auth",
      title: "Scanned: authentication flow",
      type: "explore",
      status: "running",
    });
  }

  if (/\bdashboard|admin|layout|nav\b/i.test(message)) {
    tasks.push({
      id: "sa-layout",
      title: "Scanned: layout and navigation",
      type: "generic",
      status: "running",
    });
  }

  tasks.push({
    id: "sa-codebase",
    title: "Scanned: relevant project files",
    type: "explore",
    status: "running",
  });

  return tasks.slice(0, 3);
}

export function runSubagentInvestigation(
  message: string,
  files: Array<{ path: string; content?: string | null }>,
): { steps: SubagentStep[]; contextBlock: string } {
  const keywords = tokenize(message);
  const ranked = [...files]
    .map((f) => ({
      path: f.path,
      score: scoreFile(f.path, f.content ?? "", keywords),
    }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const fallback = files
    .filter((f) => /app\/page|App\.tsx|main\.tsx|index\.html|layout/i.test(f.path))
    .map((f) => f.path)
    .slice(0, 5);

  const inspected = (ranked.length > 0 ? ranked.map((r) => r.path) : fallback).slice(0, 6);

  const tasks = buildTasks(message).map((task) => {
    const taskKeywords = task.id.includes("auth")
      ? ["auth", "login", "session", "user"]
      : task.id.includes("layout")
        ? ["layout", "nav", "header", "sidebar"]
        : keywords;

    const taskFiles = [...files]
      .map((f) => ({ path: f.path, score: scoreFile(f.path, f.content ?? "", taskKeywords) }))
      .filter((f) => f.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((f) => f.path);

    const paths = taskFiles.length > 0 ? taskFiles : inspected.slice(0, 3);
    const finding =
      paths.length > 0
        ? `Inspected ${paths.length} file${paths.length === 1 ? "" : "s"}: ${paths.join(", ")}`
        : "No strongly matching files — starting from entry points.";

    return {
      ...task,
      status: "done" as const,
      filesInspected: paths,
      finding,
    };
  });

  const contextBlock =
    inspected.length > 0
      ? [
          "<subagent_findings>",
          "Read-only investigation before implementation:",
          ...tasks.map((t) => `- ${t.title}: ${t.finding}`),
          "Prioritize these paths when making changes.",
          "</subagent_findings>",
        ].join("\n")
      : "";

  return { steps: tasks, contextBlock: contextBlock ? `\n\n${contextBlock}` : "" };
}

/**
 * Rank files by keyword relevance, highest first.
 *
 * Exported so `subagents-parallel.ts` can reuse this scoring to decide which files
 * each real subagent gets. The scoring is the part of this module that genuinely
 * works; paying a model to re-derive a file ranking would be spending money to
 * replace something deterministic and free.
 */
export function rankFilesByKeywords(
  files: Array<{ path: string; content?: string | null }>,
  keywords: string[],
): string[] {
  return [...files]
    .map((f) => ({ path: f.path, score: scoreFile(f.path, f.content ?? "", keywords) }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((f) => f.path);
}
