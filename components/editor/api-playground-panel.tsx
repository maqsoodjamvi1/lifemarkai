"use client";

import { useState, useMemo } from "react";
import { Play, Plus, Trash2, Copy, Check, Loader2, ChevronDown, Search, X, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface ApiPlaygroundPanelProps {
  projectId: string;
  files: ProjectFile[];
}

interface ApiRoute {
  path: string;
  methods: string[];
  params: string[];
}

interface Header { key: string; value: string }

interface RequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration_ms: number;
  size_bytes: number;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type HttpMethod = typeof HTTP_METHODS[number];

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET:    "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  POST:   "text-sky-400 border-sky-500/30 bg-sky-500/10",
  PUT:    "text-amber-400 border-amber-500/30 bg-amber-500/10",
  PATCH:  "text-violet-400 border-violet-500/30 bg-violet-500/10",
  DELETE: "text-red-400 border-red-500/30 bg-red-500/10",
};

// ─── Parse routes from project files ─────────────────────────────────────────

function parseApiRoutes(files: ProjectFile[]): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const routeFiles = files.filter(
    (f) => f.path.includes("app/api/") && (f.path.endsWith("route.ts") || f.path.endsWith("route.js"))
  );

  for (const file of routeFiles) {
    // Derive path from file path: app/api/foo/bar/route.ts → /api/foo/bar
    const pathSegments = file.path
      .replace(/^.*?app\//, "")
      .replace(/\/route\.(ts|js)$/, "");
    const routePath = "/" + pathSegments;

    // Extract [param] segments
    const params = (routePath.match(/\[([^\]]+)\]/g) ?? []).map((p) => p.slice(1, -1));

    // Detect exported methods
    const content = file.content ?? "";
    const methods: string[] = [];
    for (const method of HTTP_METHODS) {
      if (new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s*\\{[^}]*\\b${method}\\b`).test(content)) {
        methods.push(method);
      }
    }
    if (methods.length === 0) methods.push("GET"); // assume GET

    routes.push({ path: routePath, methods, params });
  }

  // Deduplicate + sort
  const seen = new Set<string>();
  return routes.filter((r) => {
    if (seen.has(r.path)) return false;
    seen.add(r.path);
    return true;
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function formatBody(raw: string, contentType: string): string {
  if (contentType.includes("application/json")) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { /* fall through */ }
  }
  return raw;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ApiPlaygroundPanel({ projectId, files }: ApiPlaygroundPanelProps) {
  const routes = useMemo(() => parseApiRoutes(files), [files]);

  const [search, setSearch] = useState("");
  const [selectedRoute, setSelectedRoute] = useState<ApiRoute | null>(routes[0] ?? null);
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [pathOverride, setPathOverride] = useState(routes[0]?.path ?? "");
  const [headers, setHeaders] = useState<Header[]>([
    { key: "Content-Type", value: "application/json" },
  ]);
  const [body, setBody] = useState('{\n  \n}');
  const [activeTab, setActiveTab] = useState<"body" | "headers" | "response">("body");
  const [result, setResult] = useState<RequestResult | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  const filteredRoutes = routes.filter((r) =>
    !search || r.path.toLowerCase().includes(search.toLowerCase())
  );

  function selectRoute(route: ApiRoute) {
    setSelectedRoute(route);
    setPathOverride(route.path);
    setMethod((route.methods[0] as HttpMethod) ?? "GET");
    setResult(null);
  }

  async function sendRequest() {
    setSending(true);
    setResult(null);
    const start = Date.now();

    try {
      const reqHeaders: Record<string, string> = {};
      for (const h of headers) {
        if (h.key.trim()) reqHeaders[h.key.trim()] = h.value;
      }

      const init: RequestInit = { method, headers: reqHeaders };
      if (method !== "GET") {
        init.body = body;
      }

      const res = await fetch(pathOverride, init);
      const raw = await res.text();
      const ct = res.headers.get("content-type") ?? "";

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { resHeaders[k] = v; });

      setResult({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: formatBody(raw, ct),
        duration_ms: Date.now() - start,
        size_bytes: new Blob([raw]).size,
      });
      setActiveTab("response");
    } catch (err) {
      setResult({
        status: 0,
        statusText: "Network error",
        headers: {},
        body: String(err),
        duration_ms: Date.now() - start,
        size_bytes: 0,
      });
      setActiveTab("response");
    } finally {
      setSending(false);
    }
  }

  function addHeader() {
    setHeaders((h) => [...h, { key: "", value: "" }]);
  }

  function removeHeader(i: number) {
    setHeaders((h) => h.filter((_, idx) => idx !== i));
  }

  function updateHeader(i: number, field: "key" | "value", val: string) {
    setHeaders((h) => h.map((header, idx) => idx === i ? { ...header, [field]: val } : header));
  }

  function copyResult() {
    if (!result) return;
    navigator.clipboard.writeText(result.body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const statusColor =
    !result        ? "" :
    result.status >= 500 ? "text-red-400" :
    result.status >= 400 ? "text-amber-400" :
    result.status >= 300 ? "text-sky-400" :
    "text-emerald-400";

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Play className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-foreground">API Playground</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {routes.length} routes
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Test your API routes without leaving the editor</p>
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Route list */}
        <div className="border-b border-border">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter routes…"
                className="pl-8 h-7 text-xs bg-muted/30 border-border"
              />
            </div>
          </div>
          <div className="max-h-36 overflow-y-auto divide-y divide-border">
            {filteredRoutes.length === 0 ? (
              <p className="text-[11px] text-muted-foreground px-3 py-3 text-center">
                {routes.length === 0 ? "No API routes detected in project files" : "No routes match filter"}
              </p>
            ) : (
              filteredRoutes.map((route) => (
                <button
                  key={route.path}
                  onClick={() => selectRoute(route)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    selectedRoute?.path === route.path ? "bg-muted/40" : "hover:bg-muted/20"
                  }`}
                >
                  <div className="flex gap-1 shrink-0">
                    {route.methods.map((m) => (
                      <span key={m} className={`text-[9px] font-mono font-bold px-1 rounded border ${METHOD_COLORS[m as HttpMethod] ?? ""}`}>
                        {m}
                      </span>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-foreground truncate">{route.path}</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Request builder */}
        <div className="p-3 border-b border-border space-y-2">
          <div className="flex gap-2">
            <Select value={method} onValueChange={(v) => setMethod(v as HttpMethod)}>
              <SelectTrigger className="w-24 h-8 text-xs bg-muted/30 border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={pathOverride}
              onChange={(e) => setPathOverride(e.target.value)}
              className="flex-1 h-8 text-xs font-mono bg-muted/30 border-border"
              placeholder="/api/..."
            />
            <Button size="sm" className="h-8 gap-1 shrink-0" onClick={sendRequest} disabled={sending}>
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Send
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 px-3 pt-2 border-b border-border">
          {(["body", "headers", "response"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-t text-[11px] font-medium capitalize transition-all ${
                activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
              {tab === "response" && result && (
                <span className={`ml-1.5 font-mono ${statusColor}`}>{result.status}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {activeTab === "body" && (
            <div className="space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Request body (JSON)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full h-40 resize-none rounded-lg border border-border bg-muted/20 p-2 text-[11px] font-mono text-foreground focus:outline-none focus:border-violet-500/40"
                spellCheck={false}
                disabled={method === "GET"}
                placeholder={method === "GET" ? "GET requests have no body" : "{}"}
              />
            </div>
          )}

          {activeTab === "headers" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">Request headers</label>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={addHeader}>
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-1.5">
                {headers.map((h, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <Input
                      value={h.key}
                      onChange={(e) => updateHeader(i, "key", e.target.value)}
                      placeholder="Key"
                      className="h-7 text-xs font-mono bg-muted/30 border-border flex-1"
                    />
                    <Input
                      value={h.value}
                      onChange={(e) => updateHeader(i, "value", e.target.value)}
                      placeholder="Value"
                      className="h-7 text-xs bg-muted/30 border-border flex-1"
                    />
                    <button onClick={() => removeHeader(i)}>
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "response" && (
            result ? (
              <div className="space-y-3">
                {/* Status line */}
                <div className="flex items-center gap-3 text-xs">
                  <span className={`font-mono font-bold text-base ${statusColor}`}>{result.status}</span>
                  <span className="text-muted-foreground">{result.statusText}</span>
                  <span className="text-muted-foreground ml-auto">{result.duration_ms}ms · {result.size_bytes}B</span>
                </div>
                {/* Body */}
                <div className="relative">
                  <pre className="rounded-lg border border-border bg-muted/20 p-3 text-[10px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-48">
                    {result.body || "(empty body)"}
                  </pre>
                  <button onClick={copyResult} className="absolute top-2 right-2">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                </div>
                {/* Response headers (collapsed) */}
                <details className="text-[10px]">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                    Response headers ({Object.keys(result.headers).length})
                  </summary>
                  <div className="mt-1.5 space-y-0.5 pl-2 border-l border-border">
                    {Object.entries(result.headers).map(([k, v]) => (
                      <div key={k} className="flex gap-2 font-mono">
                        <span className="text-muted-foreground">{k}:</span>
                        <span className="text-foreground truncate">{v}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Code2 className="w-7 h-7 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">Send a request to see the response</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
