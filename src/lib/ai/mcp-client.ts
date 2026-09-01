/**
 * Minimal MCP (Model Context Protocol) client — Streamable-HTTP transport.
 *
 * Zero dependencies: plain JSON-RPC 2.0 POSTs to the remote server URL.
 * Handles both response content types the spec allows:
 *   • application/json  — single JSON-RPC response body, parsed directly
 *   • text/event-stream — SSE stream; we read `data:` lines and take the
 *     JSON-RPC message whose `id` matches our request
 *
 * Used by app/api/mcp/servers (test connection) and app/api/ai/agent
 * (expose user connectors as agent tools). Server URLs must be https
 * (localhost excepted for local dev).
 */

const MCP_PROTOCOL_VERSION = "2025-03-26";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TOOLS = 40;
const MAX_RESULT_CHARS = 8_000;

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpInitializeResult {
  sessionId?: string;
  serverInfo?: { name?: string; version?: string };
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

let rpcIdCounter = 1;

/**
 * Reject anything that isn't https, except localhost for local development
 * (guarded to non-production below), and reject any hostname that resolves
 * by name alone to a private/link-local/loopback range. This is checked
 * again on every redirect in mcpRpc() below — an https server the caller
 * registered is otherwise free to 302 the request anywhere, including
 * cloud-metadata addresses, once the initial hostname check has passed.
 */
function assertAllowedUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid MCP server URL: ${url}`);
  }
  const host = parsed.hostname.toLowerCase();
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  // The localhost carve-out is for local development only — a production
  // deployment must not let any authenticated user use this as a probe
  // against services bound to the app server's own loopback interface.
  const localhostAllowed = isLocalhost && process.env.NODE_ENV !== "production";
  if (parsed.protocol !== "https:" && !localhostAllowed) {
    throw new Error("MCP server URL must use https (localhost excepted in development).");
  }
  if (
    !localhostAllowed &&
    (isLocalhost ||
      host === "0.0.0.0" ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host) || // link-local / cloud metadata
      host.endsWith(".internal") ||
      host.endsWith(".local"))
  ) {
    throw new Error("MCP server URL must not point at a private, loopback, or link-local address.");
  }
  return parsed;
}

function buildHeaders(authHeader?: string | null, sessionId?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(authHeader ? { Authorization: authHeader } : {}),
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };
}

/**
 * Parse an SSE body and return the JSON-RPC message whose id matches.
 * Reads the whole (already-completed) response text; MCP servers close the
 * stream after delivering the response to a POSTed request.
 */
function parseSseForId(sseText: string, id: number | string): JsonRpcResponse | null {
  // SSE events are separated by blank lines; each event has 1+ `data:` lines.
  const events = sseText.split(/\r?\n\r?\n/);
  let fallback: JsonRpcResponse | null = null;
  for (const event of events) {
    const dataLines = event
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) continue;
    const payload = dataLines.join("\n");
    try {
      const msg = JSON.parse(payload) as JsonRpcResponse;
      if (msg && msg.id === id) return msg;
      // Remember the last response-shaped message in case ids don't line up.
      if (msg && (msg.result !== undefined || msg.error !== undefined)) fallback = msg;
    } catch {
      // Ignore non-JSON keep-alives / partial data.
    }
  }
  return fallback;
}

/**
 * Send one JSON-RPC request (or notification when `id` is null) and return
 * the parsed response plus any `Mcp-Session-Id` header the server issued.
 */
async function mcpRpc(
  url: string,
  method: string,
  params: Record<string, unknown>,
  opts: { authHeader?: string | null; sessionId?: string | null; notification?: boolean } = {}
): Promise<{ result: unknown; sessionId?: string }> {
  assertAllowedUrl(url);
  const id = opts.notification ? null : rpcIdCounter++;
  const body: Record<string, unknown> = { jsonrpc: "2.0", method, params };
  if (!opts.notification) body.id = id;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(opts.authHeader, opts.sessionId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      // Never auto-follow a redirect: assertAllowedUrl() only validated the
      // URL the caller registered, and a server the caller controls is free
      // to answer with a 3xx pointing anywhere (internal services, cloud
      // metadata) if redirects were followed blindly. A 3xx response now
      // just fails the res.ok check below like any other bad response.
      redirect: "manual",
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError"
      ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : err instanceof Error ? err.message : String(err);
    throw new Error(`MCP server unreachable (${method}): ${reason}`);
  }

  const newSessionId = res.headers.get("Mcp-Session-Id") ?? undefined;

  // Notifications: servers typically answer 202 Accepted with no body.
  if (opts.notification) {
    return { result: undefined, sessionId: newSessionId };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MCP server error (${method}): HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  let rpc: JsonRpcResponse | null = null;

  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    rpc = parseSseForId(text, id as number);
    if (!rpc) throw new Error(`MCP server (${method}): no JSON-RPC response found in event stream.`);
  } else {
    // application/json (or unlabeled) — parse the body directly.
    const text = await res.text();
    try {
      rpc = JSON.parse(text) as JsonRpcResponse;
    } catch {
      throw new Error(`MCP server (${method}): response was not valid JSON.`);
    }
  }

  if (rpc.error) {
    throw new Error(`MCP server (${method}): ${rpc.error.message ?? `JSON-RPC error ${rpc.error.code}`}`);
  }
  return { result: rpc.result, sessionId: newSessionId };
}

/**
 * Perform the MCP initialize handshake. Captures the `Mcp-Session-Id`
 * response header (pass it to subsequent calls) and fires the
 * `notifications/initialized` notification without awaiting failures.
 */
export async function mcpInitialize(
  url: string,
  authHeader?: string | null
): Promise<McpInitializeResult> {
  const { result, sessionId } = await mcpRpc(url, "initialize", {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "lifemarkai", version: "1.0" },
  }, { authHeader });

  // Fire-and-forget per spec; some servers require it before tools/list.
  mcpRpc(url, "notifications/initialized", {}, { authHeader, sessionId, notification: true })
    .catch(() => {});

  const serverInfo = (result as { serverInfo?: { name?: string; version?: string } } | undefined)
    ?.serverInfo;
  return { sessionId, serverInfo };
}

/** List the server's tools (capped at 40). */
export async function mcpListTools(
  url: string,
  authHeader?: string | null,
  sessionId?: string | null
): Promise<McpToolInfo[]> {
  const { result } = await mcpRpc(url, "tools/list", {}, { authHeader, sessionId });
  const tools = (result as { tools?: unknown } | undefined)?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.slice(0, MAX_TOOLS).map((t) => {
    const tool = t as Record<string, unknown>;
    return {
      name: String(tool.name ?? ""),
      description: String(tool.description ?? ""),
      inputSchema:
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? (tool.inputSchema as Record<string, unknown>)
          : undefined,
    };
  }).filter((t) => t.name);
}

/**
 * Call a tool and return its result as a plain string (content[].text joined,
 * capped at 8000 chars). Non-text content parts are summarized by type.
 */
export async function mcpCallTool(
  url: string,
  opts: { name: string; args: Record<string, unknown>; authHeader?: string | null; sessionId?: string | null }
): Promise<string> {
  const { result } = await mcpRpc(
    url,
    "tools/call",
    { name: opts.name, arguments: opts.args ?? {} },
    { authHeader: opts.authHeader, sessionId: opts.sessionId }
  );

  const r = result as { content?: unknown; isError?: boolean } | undefined;
  const parts: string[] = [];
  if (Array.isArray(r?.content)) {
    for (const part of r.content as Array<Record<string, unknown>>) {
      if (typeof part?.text === "string") parts.push(part.text);
      else if (part?.type) parts.push(`[${String(part.type)} content omitted]`);
    }
  }
  let text = parts.join("\n").trim();
  if (!text) text = r ? JSON.stringify(r).slice(0, 500) : "(empty result)";
  if (r?.isError) text = `Tool reported an error: ${text}`;
  return text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}…[truncated]` : text;
}
