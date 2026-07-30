/**
 * App-as-MCP endpoint — "agent integrations" (Lovable parity).
 *
 * Exposes a PUBLISHED LifemarkAI app as an MCP server so external AI assistants
 * (ChatGPT / Claude / Cursor) can call its actions as tools. Streamable-HTTP
 * MCP transport = a single POST endpoint speaking JSON-RPC 2.0.
 *
 *   Endpoint : POST /api/apps/:id/mcp
 *   Auth     : Authorization: Bearer <app_mcp.token>
 *   Methods  : initialize · ping · tools/list · tools/call
 *
 * Each configured action (app_mcp.actions) becomes an MCP tool whose call is
 * proxied to the app's deployed URL. Config lives in `app_mcp` (migration 153).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/server";


interface McpAction {
  name: string;
  description?: string;
  method?: string;
  path?: string;
  input_schema?: Record<string, unknown>;
}

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function rpcResult(id: unknown, result: unknown, origin: string) {
  return Response.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: cors(origin) });
}
function rpcError(id: unknown, code: number, message: string, origin: string, status = 200) {
  return Response.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status, headers: cors(origin) },
  );
}

function actionToTool(a: McpAction) {
  return {
    name: a.name,
    description: a.description ?? `Call the ${a.name} action of this app.`,
    inputSchema:
      a.input_schema && typeof a.input_schema === "object"
        ? a.input_schema
        : { type: "object", properties: {}, additionalProperties: true },
  };
}

/** Substitute {param} placeholders in the path and split remaining args into query/body. */
function buildActionRequest(base: string, action: McpAction, args: Record<string, unknown>) {
  const method = (action.method ?? "POST").toUpperCase();
  let path = action.path ?? "/";
  const used = new Set<string>();
  path = path.replace(/\{(\w+)\}/g, (_m, k) => {
    used.add(k);
    return encodeURIComponent(String(args[k] ?? ""));
  });
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) if (!used.has(k)) rest[k] = v;

  const url = new URL(path, base.endsWith("/") ? base : base + "/");
  const init: RequestInit = { method, headers: { "Content-Type": "application/json" } };
  if (method === "GET" || method === "HEAD") {
    for (const [k, v] of Object.entries(rest)) url.searchParams.set(k, String(v));
  } else {
    init.body = JSON.stringify(rest);
  }
  return { url: url.toString(), init };
}

async function handlePOST(req: Request, params: { id: string }) {
  const origin = req.headers.get("origin") ?? "*";
  const { id } = params;

  const supabase = await createAdminClient();
  const { data: cfg } = await supabase
    .from("app_mcp")
    .select("enabled, token, actions")
    .eq("project_id", id)
    .maybeSingle();

  if (!cfg || !cfg.enabled) {
    return rpcError(null, -32601, "This app does not expose an MCP endpoint.", origin, 404);
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== cfg.token) {
    return rpcError(null, -32001, "Unauthorized", origin, 401);
  }

  const { data: project } = await supabase
    .from("projects")
    .select("name, description, deployed_url")
    .eq("id", id)
    .maybeSingle();

  let rpc: { id?: unknown; method?: string; params?: Record<string, unknown> };
  try {
    rpc = await req.json();
  } catch {
    return rpcError(null, -32700, "Parse error", origin, 400);
  }

  const actions: McpAction[] = Array.isArray(cfg.actions) ? (cfg.actions as McpAction[]) : [];

  switch (rpc.method) {
    case "initialize":
      return rpcResult(
        rpc.id,
        {
          protocolVersion: "2024-11-05",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: project?.name || "LifemarkAI app", version: "1.0.0" },
          instructions: project?.description || undefined,
        },
        origin,
      );

    case "ping":
      return rpcResult(rpc.id, {}, origin);

    case "tools/list":
      return rpcResult(rpc.id, { tools: actions.map(actionToTool) }, origin);

    case "tools/call": {
      const name = rpc.params?.name as string | undefined;
      const args = (rpc.params?.arguments as Record<string, unknown> | undefined) ?? {};
      const action = actions.find((a) => a.name === name);
      if (!action) return rpcError(rpc.id, -32602, `Unknown tool: ${name}`, origin);
      if (!project?.deployed_url) {
        return rpcError(rpc.id, -32000, "App is not deployed yet.", origin);
      }
      try {
        const { url, init } = buildActionRequest(project.deployed_url, action, args);
        const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
        const text = await res.text();
        return rpcResult(
          rpc.id,
          {
            content: [{ type: "text", text: text.slice(0, 100_000) }],
            isError: !res.ok,
          },
          origin,
        );
      } catch (err) {
        return rpcResult(
          rpc.id,
          { content: [{ type: "text", text: `Action failed: ${err instanceof Error ? err.message : String(err)}` }], isError: true },
          origin,
        );
      }
    }

    default:
      return rpcError(rpc.id, -32601, `Method not found: ${rpc.method}`, origin);
  }
}

async function handleOPTIONS(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, { status: 204, headers: cors(origin) });
}


export const Route = createFileRoute("/api/apps/$id/mcp")({
  server: { handlers: {
    POST: async ({ request, params }) => handlePOST(request, params as any),
    OPTIONS: async ({ request }) => handleOPTIONS(request),
  } },
});
