import type { EditorMode } from "@/components/editor/editor-layout";

export type SubagentStatus = "running" | "done" | "error";

export interface SubagentStep {
  id: string;
  title: string;
  type: "explore" | "generic";
  status: SubagentStatus;
  filesInspected?: string[];
  finding?: string;
}

const EXPLORE_TRIGGERS =
  /\b(subagent|explore|investigate|how does|how do|where is|where are|why does|why is|research|inspect|walk me through|structure of)\b/i;

/** Lovable-style parallel read-only investigations before large builds. */
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

function buildTasks(message: string, files: Array<{ path: string; content?: string | null }>): SubagentStep[] {
  const keywords = tokenize(message).slice(0, 12);
  const tasks: SubagentStep[] = [];

  if (/\bauth|login|signup|session|oauth\b/i.test(message)) {
    tasks.push({
      id: "sa-auth",
      title: "Explore: authentication flow",
      type: "explore",
      status: "running",
    });
  }

  if (/\bdashboard|admin|layout|nav\b/i.test(message)) {
    tasks.push({
      id: "sa-layout",
      title: "Explore: layout and navigation",
      type: "generic",
      status: "running",
    });
  }

  tasks.push({
    id: "sa-codebase",
    title: "Explore: relevant project files",
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

  const tasks = buildTasks(message, files).map((task) => {
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
