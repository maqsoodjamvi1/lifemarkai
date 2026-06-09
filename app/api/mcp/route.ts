/**
 * LifemarkAI MCP Server — JSON-RPC 2.0 over HTTP (Streamable HTTP transport)
 *
 * External tools (Claude Desktop, Cursor, etc.) can connect via:
 *   claude mcp add lifemarkai --transport http https://your-domain.com/api/mcp?token=API_TOKEN
 *
 * Tools exposed:
 *   list_projects        — list the user's projects
 *   get_project_files    — read all files in a project
 *   update_project_file  — write / overwrite one file in a project
 *   send_chat_message    — queue an AI build request for a project
 *   create_project       — create a new project
 *   get_project_info     — get metadata (deployed URL, framework, status)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUILT_IN_TEMPLATES } from "@/lib/templates/built-in";
import { enqueueDeployJob, getDeployQueue } from "@/lib/queue/client";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";

// ── MCP Protocol constants ───────────────────────────────────────────────────
const MCP_VERSION = "2024-11-05";
const SERVER_NAME = "lifemarkai";
const SERVER_VERSION = "1.1.0";

// ── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "list_projects",
    description: "List all projects owned by the authenticated user",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_project_files",
    description: "Get all source files in a project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The project UUID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "update_project_file",
    description: "Create or overwrite a file in a project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The project UUID" },
        path: { type: "string", description: "File path, e.g. components/Button.tsx" },
        content: { type: "string", description: "Full file content" },
        language: { type: "string", description: "Language (typescript, css, json, …). Auto-detected if omitted." },
      },
      required: ["project_id", "path", "content"],
    },
  },
  {
    name: "send_chat_message",
    description: "Send a message to the AI build system for a project (triggers code generation)",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The project UUID" },
        message: { type: "string", description: "The instruction for the AI" },
        model: {
          type: "string",
          description: "AI model to use. Defaults to claude-opus-4-6.",
          enum: ["gpt-4o", "gpt-4o-mini", "claude-opus-4-6", "claude-sonnet-4-6", "gemini-2.0-flash"],
        },
      },
      required: ["project_id", "message"],
    },
  },
  {
    name: "create_project",
    description: "Create a new LifemarkAI project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable project name" },
        description: { type: "string", description: "Short description" },
        framework: {
          type: "string",
          description: "Framework: nextjs, react, vue, svelte, vanilla. Defaults to nextjs.",
          enum: ["nextjs", "react", "vue", "svelte", "vanilla"],
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_project_info",
    description: "Get metadata for a project: framework, status, deployed URL, last updated",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The project UUID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "deploy_project",
    description: "Trigger a deployment for a project (queues build + publish)",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The project UUID" },
        provider: { type: "string", description: "Deploy provider", enum: ["netlify", "vercel"] },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_deploy_status",
    description: "Get the latest deployment status and URL for a project",
    inputSchema: {
      type: "object",
      properties: {
        project_id: { type: "string", description: "The project UUID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "list_templates",
    description: "List built-in project starter templates",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
] as const;

// ── Auth helper — supports Bearer token or ?token= query param ───────────────
async function authenticateRequest(req: NextRequest): Promise<string | null> {
  const adminClient = await createAdminClient();
  // Try Authorization: Bearer <token>
  const authHeader = req.headers.get("authorization") ?? "";
  const queryToken = req.nextUrl.searchParams.get("token") ?? "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : queryToken;
  if (!rawToken) return null;

  // Look up the API token in profiles.mcp_api_token column
  const { data } = await (adminClient as any)
    .from("profiles")
    .select("id")
    .eq("mcp_api_token", rawToken)
    .single();

  return data?.id ?? null;
}

// ── Tool handlers ─────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTool(toolName: string, args: Record<string, any>, userId: string) {
  const admin = await createAdminClient();

  switch (toolName) {
    case "list_projects": {
      const { data, error } = await (admin as any)
        .from("projects")
        .select("id, name, description, framework, status, deployed_url, created_at, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return { projects: data ?? [] };
    }

    case "get_project_files": {
      const { project_id } = args;
      // Verify ownership
      const { data: proj } = await (admin as any)
        .from("projects").select("id").eq("id", project_id).eq("user_id", userId).single();
      if (!proj) throw new Error("Project not found or access denied");

      const { data: files, error } = await (admin as any)
        .from("project_files")
        .select("path, content, language")
        .eq("project_id", project_id)
        .order("path");
      if (error) throw new Error(error.message);
      return { files: files ?? [] };
    }

    case "update_project_file": {
      const { project_id, path, content, language } = args;
      // Verify ownership
      const { data: proj } = await (admin as any)
        .from("projects").select("id").eq("id", project_id).eq("user_id", userId).single();
      if (!proj) throw new Error("Project not found or access denied");

      // Detect language from extension if not provided
      const ext = path.split(".").pop() ?? "";
      const LANG_MAP: Record<string, string> = {
        ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
        css: "css", html: "html", json: "json", md: "markdown", py: "python",
        sql: "sql", yaml: "yaml", yml: "yaml",
      };
      const detectedLang = language ?? (LANG_MAP[ext] ?? "plaintext");

      const { error } = await (admin as any)
        .from("project_files")
        .upsert({ project_id, path, content, language: detectedLang }, { onConflict: "project_id,path" });
      if (error) throw new Error(error.message);
      return { ok: true, path, language: detectedLang };
    }

    case "send_chat_message": {
      const { project_id, message, model = DEFAULT_CODING_MODEL } = args;
      // Verify ownership
      const { data: proj } = await (admin as any)
        .from("projects").select("id").eq("id", project_id).eq("user_id", userId).single();
      if (!proj) throw new Error("Project not found or access denied");

      // Insert message into the project's chat (the editor will pick it up via realtime)
      const { error } = await (admin as any)
        .from("messages")
        // messages has no user_id column — including it made this insert (and
        // therefore the whole send_chat_message MCP tool) fail on every call.
        .insert({ project_id, role: "user", content: message, metadata: { model, source: "mcp", user_id: userId } });
      if (error) throw new Error(error.message);

      // Fire chat route non-blocking (best-effort)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      if (appUrl) {
        void fetch(`${appUrl}/api/ai/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-mcp-internal": "1" },
          body: JSON.stringify({ projectId: project_id, message, model, userId, mode: "build" }),
        }).catch(() => {});
      }

      return { ok: true, message: "Chat message queued. Files will be generated asynchronously." };
    }

    case "create_project": {
      const { name, description = "", framework = "nextjs" } = args;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: proj, error } = await (admin as any)
        .from("projects")
        // status omitted — projects.status has CHECK (status IN ('active','archived','building'));
        // "draft" violates it and made create_project fail. The column default is 'active'.
        .insert({ user_id: userId, name, description, framework, slug: `${slug}-${Date.now()}` })
        .select("id, name, slug, framework, status, created_at")
        .single();
      if (error) throw new Error(error.message);
      return { project: proj };
    }

    case "get_project_info": {
      const { project_id } = args;
      const { data: proj, error } = await (admin as any)
        .from("projects")
        .select("id, name, description, framework, status, deployed_url, preview_url, cloud_enabled, cloud_status, created_at, updated_at")
        .eq("id", project_id)
        .eq("user_id", userId)
        .single();
      if (error || !proj) throw new Error("Project not found or access denied");
      return { project: proj };
    }

    case "deploy_project": {
      const { project_id, provider = "netlify" } = args;
      const { data: project } = await (admin as any)
        .from("projects")
        .select("id, name, user_id, project_files(path, content, language)")
        .eq("id", project_id)
        .eq("user_id", userId)
        .single();
      if (!project) throw new Error("Project not found or access denied");

      const files = (project.project_files ?? []) as Array<{ path: string; content: string; language?: string }>;
      const { data: deployment, error: depErr } = await (admin as any)
        .from("deployments")
        .insert({
          project_id,
          user_id: userId,
          status: "building",
          provider,
          file_count: files.length,
        })
        .select("id, status, provider, created_at")
        .single();
      if (depErr || !deployment) throw new Error(depErr?.message ?? "Failed to create deployment");

      const queue = getDeployQueue();
      if (queue) {
        await enqueueDeployJob({
          projectId: project_id,
          userId,
          deploymentId: deployment.id,
          provider: provider as "netlify" | "vercel" | "lifemarkai",
          projectName: project.name ?? "app",
          badgeHidden: false,
        });
      }

      return {
        ok: true,
        deployment_id: deployment.id,
        status: deployment.status,
        message: queue ? "Deployment queued" : "Deployment record created (queue unavailable)",
      };
    }

    case "get_deploy_status": {
      const { project_id } = args;
      const { data: proj } = await (admin as any)
        .from("projects")
        .select("id, deployed_url, status")
        .eq("id", project_id)
        .eq("user_id", userId)
        .single();
      if (!proj) throw new Error("Project not found or access denied");

      const { data: deployment } = await (admin as any)
        .from("deployments")
        .select("id, status, url, provider, error_message, created_at")
        .eq("project_id", project_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        project: { id: proj.id, deployed_url: proj.deployed_url, status: proj.status },
        latest_deployment: deployment ?? null,
      };
    }

    case "list_templates": {
      const templates = BUILT_IN_TEMPLATES.map(({ files: _f, ...meta }) => ({
        ...meta,
        file_count: _f.length,
      }));
      return { templates };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────
function rpcOk(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcErr(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ── Request handler ───────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Auth
  const userId = await authenticateRequest(req);
  if (!userId) {
    return NextResponse.json(
      rpcErr(null, -32001, "Unauthorized — provide a valid MCP API token"),
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcErr(null, -32700, "Parse error"), { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = body as any;
  const { jsonrpc, id, method, params = {} } = rpc;

  if (jsonrpc !== "2.0") {
    return NextResponse.json(rpcErr(id ?? null, -32600, "Invalid JSON-RPC version"), { status: 400 });
  }

  // ── MCP method dispatch ───────────────────────────────────────────────────
  try {
    switch (method) {
      case "initialize":
        return NextResponse.json(rpcOk(id, {
          protocolVersion: MCP_VERSION,
          capabilities: { tools: { listChanged: false }, resources: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        }));

      case "tools/list":
        return NextResponse.json(rpcOk(id, { tools: TOOLS }));

      case "tools/call": {
        const { name, arguments: toolArgs = {} } = params as { name: string; arguments?: Record<string, unknown> };
        const result = await callTool(name, toolArgs as Record<string, string>, userId);
        return NextResponse.json(rpcOk(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        }));
      }

      case "resources/list":
        // Expose user's projects as resources
        return NextResponse.json(rpcOk(id, { resources: [] }));

      case "ping":
        return NextResponse.json(rpcOk(id, {}));

      default:
        return NextResponse.json(rpcErr(id, -32601, `Method not found: ${method}`), { status: 404 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json(rpcErr(id, -32000, msg), { status: 500 });
  }
}

// ── GET — server info & health ────────────────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    protocol: MCP_VERSION,
    transport: "http",
    description: "LifemarkAI MCP server — control your projects from Claude Desktop, Cursor, and other MCP clients",
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    connect: {
      claude_desktop: `claude mcp add lifemarkai --transport http ${process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app"}/api/mcp?token=YOUR_API_TOKEN`,
      cursor: `Add to .cursor/mcp.json: { "lifemarkai": { "url": "${process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.app"}/api/mcp?token=YOUR_API_TOKEN" } }`,
    },
  });
}
