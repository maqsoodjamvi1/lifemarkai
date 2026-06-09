import { generateAI, type AIMessage, type ToolDefinition, type ToolCall } from "./provider";
import { DEFAULT_CODING_MODEL } from "./model-defaults";
import { AGENT_SYSTEM_PROMPT } from "./system-prompts";

export interface AgentTool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface AgentStep {
  type: "thought" | "action" | "observation" | "done" | "error";
  content: string;
  tool?: string;
  args?: Record<string, unknown>;
  timestamp: string;
}

export interface AgentRunOptions {
  task: string;
  projectId: string;
  files: Array<{ path: string; content: string }>;
  model?: string;
  maxIterations?: number;
  /** Combined workspace + project knowledge injected before the system prompt */
  knowledge?: string;
  onStep: (step: AgentStep) => void;
  onFileChange: (path: string, content: string) => void;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  filesChanged: string[];
  steps: AgentStep[];
  tokensUsed: number;
}

function buildTools(
  files: Array<{ path: string; content: string }>,
  onFileChange: (path: string, content: string) => void
): Record<string, AgentTool> {
  const fileMap = new Map(files.map((f) => [f.path, f.content]));

  return {
    read_file: {
      name: "read_file",
      description: "Read the full contents of a file in the project",
      execute: async ({ path }: Record<string, unknown>) => {
        const content = fileMap.get(path as string);
        if (content === undefined) return `File not found: ${path}`;
        return content;
      },
    },
    write_file: {
      name: "write_file",
      description: "Write (create or overwrite) a file in the project",
      execute: async ({ path, content }: Record<string, unknown>) => {
        fileMap.set(path as string, content as string);
        onFileChange(path as string, content as string);
        return `Written: ${path}`;
      },
    },
    list_files: {
      name: "list_files",
      description: "List all files currently in the project",
      execute: async () => Array.from(fileMap.keys()).join("\n"),
    },
    search_code: {
      name: "search_code",
      description: "Search for a string or pattern across all project files. Returns matching lines with file path and line number.",
      execute: async ({ query }: Record<string, unknown>) => {
        const results: string[] = [];
        fileMap.forEach((content, filePath) => {
          content.split("\n").forEach((line, i) => {
            if (line.toLowerCase().includes((query as string).toLowerCase())) {
              results.push(`${filePath}:${i + 1}: ${line.trim()}`);
            }
          });
        });
        return results.length ? results.slice(0, 30).join("\n") : "No matches found";
      },
    },
    delete_file: {
      name: "delete_file",
      description: "Delete a file from the project",
      execute: async ({ path }: Record<string, unknown>) => {
        fileMap.delete(path as string);
        return `Deleted: ${path}`;
      },
    },
    finish: {
      name: "finish",
      description: "Signal that the task is complete and provide a summary of what was done",
      execute: async ({ summary }: Record<string, unknown>) => summary as string,
    },
  };
}

/** Build the ToolDefinition array (JSON Schema) consumed by generateAI */
function buildToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "read_file",
      description: "Read the full contents of a file in the project",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path relative to project root" } },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write (create or overwrite) a file in the project with the given content",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to project root" },
          content: { type: "string", description: "Full file content to write" },
        },
        required: ["path", "content"],
      },
    },
    {
      name: "list_files",
      description: "List all files currently in the project",
      parameters: { type: "object", properties: {} },
    },
    {
      name: "search_code",
      description: "Search for a string or pattern across all project files",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Search term or pattern" } },
        required: ["query"],
      },
    },
    {
      name: "delete_file",
      description: "Delete a file from the project",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "File path to delete" } },
        required: ["path"],
      },
    },
    {
      name: "finish",
      description: "Signal that the task is complete. Call this when all work is done.",
      parameters: {
        type: "object",
        properties: { summary: { type: "string", description: "Summary of what was accomplished" } },
        required: ["summary"],
      },
    },
  ];
}

export async function runAgent(options: AgentRunOptions): Promise<AgentResult> {
  const {
    task,
    files,
    model = DEFAULT_CODING_MODEL,
    maxIterations = 20,
    knowledge,
    onStep,
    onFileChange,
  } = options;

  const toolImpls = buildTools(files, onFileChange);
  const toolDefs = buildToolDefinitions();
  const steps: AgentStep[] = [];
  const filesChanged: string[] = [];
  let tokensUsed = 0;
  let iteration = 0;

  const systemContent = knowledge?.trim()
    ? `${AGENT_SYSTEM_PROMPT}\n\n## Project & Workspace Knowledge\n${knowledge.trim()}`
    : AGENT_SYSTEM_PROMPT;

  const messages: AIMessage[] = [
    { role: "system", content: systemContent },
    {
      role: "user",
      content: `## Task\n${task}\n\n## Project Files\n${
        files.map((f) => `- ${f.path}`).join("\n") || "(empty project)"
      }\n\nWork autonomously. Use tools to read, write, and search files. When complete, call finish().`,
    },
  ];

  while (iteration < maxIterations) {
    iteration++;

    let aiResult: Awaited<ReturnType<typeof generateAI>>;
    try {
      aiResult = await generateAI({
        model: model as never,
        messages,
        maxTokens: 4000,
        temperature: 0.3,
        tools: toolDefs,
      });
      tokensUsed += aiResult.tokensUsed;
    } catch (err) {
      const step: AgentStep = {
        type: "error",
        content: `AI call failed: ${String(err)}`,
        timestamp: new Date().toISOString(),
      };
      steps.push(step);
      onStep(step);
      break;
    }

    // ── No tool call: model responded with text ───────────────────────────
    if (!aiResult.toolCalls || aiResult.toolCalls.length === 0) {
      const step: AgentStep = {
        type: "done",
        content: aiResult.content || "Task completed.",
        timestamp: new Date().toISOString(),
      };
      steps.push(step);
      onStep(step);

      return {
        success: true,
        summary: aiResult.content || "Task completed.",
        filesChanged,
        steps,
        tokensUsed,
      };
    }

    // ── Process each tool call in this turn ───────────────────────────────
    // Append assistant message with tool calls recorded (as JSON in content)
    const toolCallSummary = aiResult.toolCalls
      .map((tc: ToolCall) => `${tc.name}(${JSON.stringify(tc.args)})`)
      .join("; ");
    messages.push({ role: "assistant", content: aiResult.content || `[tool calls: ${toolCallSummary}]` });

    const observations: string[] = [];

    for (const tc of aiResult.toolCalls as ToolCall[]) {
      // ── "finish" tool signals completion ─────────────────────────────
      if (tc.name === "finish") {
        const summary = (tc.args.summary as string) || "Task completed.";
        const step: AgentStep = {
          type: "done",
          content: summary,
          tool: "finish",
          args: tc.args,
          timestamp: new Date().toISOString(),
        };
        steps.push(step);
        onStep(step);

        return { success: true, summary, filesChanged, steps, tokensUsed };
      }

      // ── Emit action step ──────────────────────────────────────────────
      const actionStep: AgentStep = {
        type: "action",
        content: `${tc.name}(${JSON.stringify(tc.args)})`,
        tool: tc.name,
        args: tc.args,
        timestamp: new Date().toISOString(),
      };
      steps.push(actionStep);
      onStep(actionStep);

      // ── Execute the tool ──────────────────────────────────────────────
      const impl = toolImpls[tc.name];
      let observation = impl ? "" : `Unknown tool: ${tc.name}`;
      if (impl) {
        try {
          observation = await impl.execute(tc.args);
          if (tc.name === "write_file" && tc.args.path) {
            const p = tc.args.path as string;
            if (!filesChanged.includes(p)) filesChanged.push(p);
          }
        } catch (err) {
          observation = `Error executing ${tc.name}: ${String(err)}`;
        }
      }

      const obsStep: AgentStep = {
        type: "observation",
        content: `[${tc.name}] ${observation.slice(0, 500)}${observation.length > 500 ? "…" : ""}`,
        timestamp: new Date().toISOString(),
      };
      steps.push(obsStep);
      onStep(obsStep);

      observations.push(`Tool: ${tc.name}\nResult: ${observation}`);
    }

    // Feed all observations back as a single user message
    messages.push({
      role: "user",
      content: observations.join("\n\n---\n\n") + "\n\nContinue with the task.",
    });
  }

  return {
    success: false,
    summary: "Agent reached the maximum number of iterations without calling finish().",
    filesChanged,
    steps,
    tokensUsed,
  };
}
