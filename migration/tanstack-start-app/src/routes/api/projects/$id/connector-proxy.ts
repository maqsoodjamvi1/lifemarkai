// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { ENV_FILE_PATH, parseEnvFile } from "@/lib/project/env-file";
import {
  CONNECTOR_REGISTRY,
  resolveConnectorBaseUrl,
} from "@/lib/integrations/connector-registry";
import { getAppUserConnection, ensureFreshToken } from "@/lib/integrations/app-user-connections";
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


const MAX_BODY_BYTES = 256 * 1024;

interface ProxyBody {
  connector: string;
  path: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  contentType?: string;
}

interface ProxyProject {
  id: string;
  user_id: string;
  is_public: boolean;
  deployed_url: string | null;
}

function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedOrigins(project: ProxyProject): Set<string> {
  const origins = new Set<string>();
  for (const value of [process.env.NEXT_PUBLIC_APP_URL, project.deployed_url]) {
    const origin = toOrigin(value);
    if (origin) origins.add(origin);
  }
  return origins;
}

function cors(origin: string | null, origins: Set<string>): Record<string, string> {
  if (!origin || !origins.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-User-Id",
    Vary: "Origin",
  };
}

async function handlePOST(req: Request, params: any) {
  const { id: projectId } = params;
  const origin = req.headers.get("origin");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, is_public, deployed_url")
    .eq("id", projectId)
    .single();
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const typedProject = project as ProxyProject;
  const origins = allowedOrigins(typedProject);
  const headers = cors(origin, origins);

  // The proxy injects credentials. Never reflect arbitrary caller origins: a
  // public project must be called from its actual deployed app, while editor
  // use is allowed only from this Lifemark deployment.
  if (!origin || !origins.has(origin)) {
    return Response.json(
      { error: "Connector requests must originate from the Lifemark editor or this project's deployed URL." },
      { status: 403 },
    );
  }

  // Auth mirrors ai-proxy: owner, collaborator, or any caller for public apps.
  if (!typedProject.is_public && user?.id !== typedProject.user_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user?.id ?? "")
      .single();
    if (!collab) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers });
    }
  }

  // Rate limit per project: 60 calls/min
  const rl = rateLimit(`connector-proxy:${projectId}`, { limit: 60, windowMs: 60 });
  if (!rl.success) {
    return Response.json(
      { error: "Connector rate limit exceeded (60/min per project)" },
      { status: 429, headers }
    );
  }

  let body: ProxyBody;
  try {
    body = (await req.json()) as ProxyBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  const spec = CONNECTOR_REGISTRY[body.connector?.toLowerCase?.() ?? ""];
  if (!spec) {
    return Response.json(
      { error: `Unknown connector "${body.connector}". Available: ${Object.keys(CONNECTOR_REGISTRY).join(", ")}` },
      { status: 400, headers }
    );
  }
  if (typeof body.path !== "string" || !body.path.startsWith("/") || body.path.includes("..")) {
    return Response.json({ error: "path must start with / and not contain .." }, { status: 400, headers });
  }
  const method = (body.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return Response.json({ error: "Unsupported method" }, { status: 400, headers });
  }

  // ── App-user connector (per-end-user OAuth, migration 154) ──────────────────
  // When the built app sends X-App-User-Id and that end-user has connected this
  // provider, call the provider AS them with their own token instead of the
  // project-owner credentials. Guarded: absent header → unchanged behavior.
  const appUserId = req.headers.get("x-app-user-id") ?? "";
  let appUserToken: string | null = null;
  if (appUserId) {
    try {
      const admin = await createAdminClient();
      const conn = await getAppUserConnection(admin, projectId, appUserId, body.connector.toLowerCase());
      if (conn) appUserToken = await ensureFreshToken(admin, conn);
    } catch {
      /* fall back to project credentials */
    }
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

  // Skip the project-credential requirement when calling as a connected end-user.
  const missing = appUserToken ? [] : spec.requiredEnv.filter((k) => !env[k]);
  if (missing.length > 0) {
    return Response.json(
      { error: `Connector "${body.connector}" is not configured: missing ${missing.join(", ")}. Add credentials in the App Connectors panel.` },
      { status: 412, headers }
    );
  }

  // Build the upstream request
  const baseUrl = resolveConnectorBaseUrl(spec, env);
  const url = new URL(baseUrl.replace(/\/$/, "") + body.path);
  for (const [k, v] of Object.entries(body.query ?? {})) url.searchParams.set(k, String(v));

  const upstreamHeaders: Record<string, string> = {
    ...spec.headers(env),
  };
  // Per-end-user token overrides the project-owner Authorization header.
  if (appUserToken) upstreamHeaders["Authorization"] = `Bearer ${appUserToken}`;
  let upstreamBody: string | undefined;
  if (method !== "GET" && body.body !== undefined) {
    const ct = body.contentType ?? upstreamHeaders["Content-Type"] ?? "application/json";
    upstreamHeaders["Content-Type"] = ct;
    upstreamBody = typeof body.body === "string" ? body.body : ct.includes("json") ? JSON.stringify(body.body) : String(body.body);
    if (upstreamBody.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Body too large (max 256 KB)" }, { status: 413, headers });
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
    return new Response(text, {
      status: upstream.status,
      headers: { ...headers, "Content-Type": contentType },
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Upstream request failed" },
      { status: 502, headers }
    );
  }
}

export async function OPTIONS(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = params;
  const origin = req.headers.get("origin");
  const supabase = await createClient();
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, is_public, deployed_url")
    .eq("id", projectId)
    .maybeSingle();
  if (!project || !origin || !allowedOrigins(project as ProxyProject).has(origin)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: { ...cors(origin, allowedOrigins(project as ProxyProject)), "Access-Control-Max-Age": "86400" },
  });
}


export const Route = createFileRoute("/api/projects/$id/connector-proxy")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handlePOST(request, params),
    },
  },
});
