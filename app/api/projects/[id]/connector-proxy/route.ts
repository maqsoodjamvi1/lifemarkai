import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ENV_FILE_PATH, parseEnvFile } from "@/lib/project/env-file";
import {
  CONNECTOR_REGISTRY,
  resolveConnectorBaseUrl,
} from "@/lib/integrations/connector-registry";
import { rateLimit } from "@/lib/rate-limit";

// ─── POST /api/projects/[id]/connector-proxy ─────────────────────────────────
// Connector gateway for apps built with LifemarkAI (Lovable-parity).
//
// Generated apps call third-party APIs (Slack, Notion, Stripe, Twilio, …)
// through this endpoint. Credentials are read server-side from the project's
// .env (saved via the App Connectors panel) and injected as auth headers —
// they never reach the browser. Requests are restricted to the connector's
// own API host.
//
// Request:  { connector: "slack", path: "/chat.postMessage", method?: "POST",
//             body?: unknown, query?: Record<string,string>, contentType?: string }
// Response: upstream status + JSON/text body.

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 256 * 1024;

interface ProxyBody {
  connector: string;
  path: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  contentType?: string;
}

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const origin = req.headers.get("origin") ?? "*";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, is_public")
    .eq("id", projectId)
    .single();
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404, headers: cors(origin) });
  }

  // Auth mirrors ai-proxy: owner, collaborator, or any caller for public apps.
  if (!project.is_public && user?.id !== project.user_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user?.id ?? "")
      .single();
    if (!collab) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: cors(origin) });
    }
  }

  // Rate limit per project: 60 calls/min
  const rl = rateLimit(`connector-proxy:${projectId}`, { limit: 60, windowMs: 60 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Connector rate limit exceeded (60/min per project)" },
      { status: 429, headers: cors(origin) }
    );
  }

  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: cors(origin) });
  }

  const spec = CONNECTOR_REGISTRY[body.connector?.toLowerCase?.() ?? ""];
  if (!spec) {
    return NextResponse.json(
      { error: `Unknown connector "${body.connector}". Available: ${Object.keys(CONNECTOR_REGISTRY).join(", ")}` },
      { status: 400, headers: cors(origin) }
    );
  }
  if (typeof body.path !== "string" || !body.path.startsWith("/") || body.path.includes("..")) {
    return NextResponse.json({ error: "path must start with / and not contain .." }, { status: 400, headers: cors(origin) });
  }
  const method = (body.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return NextResponse.json({ error: "Unsupported method" }, { status: 400, headers: cors(origin) });
  }

  // Read connector credentials from the project's .env file
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: envRow } = await (supabase as any)
    .from("project_files")
    .select("content")
    .eq("project_id", projectId)
    .eq("path", ENV_FILE_PATH)
    .maybeSingle();
  const env = parseEnvFile((envRow as { content?: string } | null)?.content ?? "");

  const missing = spec.requiredEnv.filter((k) => !env[k]);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Connector "${body.connector}" is not configured: missing ${missing.join(", ")}. Add credentials in the App Connectors panel.` },
      { status: 412, headers: cors(origin) }
    );
  }

  // Build the upstream request
  const baseUrl = resolveConnectorBaseUrl(spec, env);
  const url = new URL(baseUrl.replace(/\/$/, "") + body.path);
  for (const [k, v] of Object.entries(body.query ?? {})) url.searchParams.set(k, String(v));

  const upstreamHeaders: Record<string, string> = {
    ...spec.headers(env),
  };
  let upstreamBody: string | undefined;
  if (method !== "GET" && body.body !== undefined) {
    const ct = body.contentType ?? upstreamHeaders["Content-Type"] ?? "application/json";
    upstreamHeaders["Content-Type"] = ct;
    upstreamBody = typeof body.body === "string" ? body.body : ct.includes("json") ? JSON.stringify(body.body) : String(body.body);
    if (upstreamBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Body too large (max 256 KB)" }, { status: 413, headers: cors(origin) });
    }
  }

  try {
    const upstream = await fetch(url.toString(), {
      method,
      headers: upstreamHeaders,
      body: upstreamBody,
      signal: AbortSignal.timeout(25_000),
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    return new NextResponse(text, {
      status: upstream.status,
      headers: { ...cors(origin), "Content-Type": contentType },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream request failed" },
      { status: 502, headers: cors(origin) }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, {
    status: 204,
    headers: { ...cors(origin), "Access-Control-Max-Age": "86400" },
  });
}
