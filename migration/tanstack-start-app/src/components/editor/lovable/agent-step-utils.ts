import type { AgentStep } from "@/lib/ai/agent";
import type { AgentStepKind } from "./agent-step-glyph";

export interface AgentTaskStep {
  label: string;
  status: "running" | "done";
  kind: AgentStepKind;
  /** Dedupe key — repeated ops on the same target collapse into one row. */
  key: string;
  /** Full project path when the step targets a file (for Live Tasks → open). */
  path?: string;
}

/** Pull a full project path out of a step's args or content. */
export function agentStepPath(step: AgentStep): string | undefined {
  const fromArgs = (step.args?.path ?? step.args?.file ?? step.args?.filename) as string | undefined;
  const raw = fromArgs ?? step.content?.match(/"(?:path|file|filename)"\s*:\s*"([^"]+)"/)?.[1];
  if (!raw) return undefined;
  return raw.replace(/\\/g, "/").replace(/^\/+/, "");
}

/** Pull a clean file name (basename) out of a step's args or content. */
export function agentStepFile(step: AgentStep): string | undefined {
  const path = agentStepPath(step);
  return path ? (path.split("/").pop() || path) : undefined;
}

/**
 * Map a raw ReAct step to a clean, human-readable activity row (Lovable-style).
 * Returns null for steps that should NOT get their own row.
 */
export function agentStepToTaskStep(step: AgentStep): AgentTaskStep | null {
  if (step.type === "thought" || step.type === "observation") return null;
  if (step.type === "done") return { label: "Done", status: "done", kind: "finalize", key: "done" };
  if (step.type === "error") {
    return { label: "Recovering from an error", status: "done", kind: "error", key: `err:${step.timestamp}` };
  }

  const tool = step.tool ?? "";
  const path = agentStepPath(step);
  const file = path ? (path.split("/").pop() || path) : undefined;
  const fk = path ?? file ?? "";

  switch (tool) {
    case "write_file":
    case "edit_file":
      return {
        label: file ? `Editing ${file}` : "Editing files",
        status: "running",
        kind: "edit",
        key: `edit:${fk}`,
        path,
      };
    case "delete_file":
      return {
        label: file ? `Removing ${file}` : "Removing files",
        status: "running",
        kind: "delete",
        key: `del:${fk}`,
        path,
      };
    case "read_file":
      return {
        label: file ? `Reading ${file}` : "Reading files",
        status: "running",
        kind: "read",
        key: `read:${fk}`,
        path,
      };
    case "list_files":
      return { label: "Exploring the project", status: "running", kind: "search", key: "list" };
    case "glob_search":
      return { label: "Searching files", status: "running", kind: "search", key: "glob" };
    case "search_code":
      return { label: "Searching the code", status: "running", kind: "search", key: "search" };
    case "find_definition":
      return { label: "Tracing definitions", status: "running", kind: "search", key: "find" };
    case "analyze_code":
      return {
        label: file ? `Checking ${file}` : "Checking the code",
        status: "running",
        kind: "analyze",
        key: `analyze:${fk}`,
        path,
      };
    case "generate_image":
      return { label: "Generating an image", status: "running", kind: "image", key: `img:${step.timestamp}` };
    case "finish":
      return { label: "Wrapping up", status: "running", kind: "finalize", key: "finish" };
    default:
      return { label: tool ? `Running ${tool}` : "Working", status: "running", kind: "other", key: `other:${tool}` };
  }
}

/**
 * Fold a streamed step into the visible activity list (Lovable-style).
 */
export function mergeAgentStep(prev: AgentTaskStep[], step: AgentStep): AgentTaskStep[] {
  if (step.type === "thought" || step.type === "observation") {
    if (prev.length === 0) return prev;
    return prev.map((s, i) => (i === prev.length - 1 ? { ...s, status: "done" as const } : s));
  }
  const next = agentStepToTaskStep(step);
  if (!next) return prev;
  const settled: AgentTaskStep[] = prev.map((s) => ({ ...s, status: "done" }));
  const existing = settled.findIndex((s) => s.key === next.key);
  if (existing >= 0) {
    const updated = [...settled];
    updated[existing] = next;
    return updated;
  }
  return [...settled, next];
}
