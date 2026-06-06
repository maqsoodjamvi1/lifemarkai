"use client";

/**
 * ApiDocsPanel
 * Parses app/api/[...]/route.ts files to auto-generate interactive API docs.
 * Shows endpoint path, HTTP method, inferred request/response shapes,
 * and a "Copy as OpenAPI" button.
 */

import { useState, useMemo } from "react";
import {
  FileCode2, ChevronDown, ChevronRight, Copy, Check,
  Search, Download, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectFile } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

interface ApiEndpoint {
  path: string;           // e.g. /api/projects/[id]
  method: HttpMethod;
  description: string;
  requestBody?: ApiParam[];
  pathParams?: ApiParam[];
  queryParams?: ApiParam[];
  responseShape: string;  // inferred JSON snippet
  sourceFile: string;
  statusCodes: string[];
}

// ─── Method badge colours ────────────────────────────────────────────────────

const METHOD_STYLES: Record<HttpMethod, string> = {
  GET:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  POST:    "bg-sky-500/15 text-sky-400 border-sky-500/30",
  PUT:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  PATCH:   "bg-violet-500/15 text-violet-400 border-violet-500/30",
  DELETE:  "bg-red-500/15 text-red-400 border-red-500/30",
  HEAD:    "bg-muted/40 text-muted-foreground border-border",
  OPTIONS: "bg-muted/40 text-muted-foreground border-border",
};

// ─── Route parser ─────────────────────────────────────────────────────────────

function filePathToApiPath(filePath: string): string {
  // app/api/projects/[id]/files/route.ts → /api/projects/[id]/files
  return filePath
    .replace(/^.*?app\/api/, "/api")
    .replace(/\/route\.[jt]s$/, "")
    .replace(/\/route\.[jt]sx$/, "");
}

function inferDescription(method: HttpMethod, path: string): string {
  const resource = path.split("/").filter(Boolean).pop() ?? "resource";
  const cleanResource = resource.replace(/^\[|\]$/g, "");
  const isById = path.includes("[");

  switch (method) {
    case "GET":    return isById ? `Get a ${cleanResource} by ID` : `List all ${cleanResource}`;
    case "POST":   return `Create a new ${cleanResource}`;
    case "PUT":    return `Replace ${cleanResource}`;
    case "PATCH":  return `Update ${cleanResource}`;
    case "DELETE": return isById ? `Delete a ${cleanResource}` : `Delete ${cleanResource}`;
    default:       return `${method} ${path}`;
  }
}

function extractPathParams(path: string): ApiParam[] {
  const params: ApiParam[] = [];
  const re = /\[([^\]]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    params.push({ name: m[1], type: "string", required: true, description: `The ${m[1]} identifier` });
  }
  return params;
}

function inferStatusCodes(method: HttpMethod, content: string): string[] {
  const codes: string[] = [];
  if (/200/.test(content)) codes.push("200 OK");
  if (/201/.test(content)) codes.push("201 Created");
  if (/204/.test(content)) codes.push("204 No Content");
  if (/400/.test(content)) codes.push("400 Bad Request");
  if (/401/.test(content)) codes.push("401 Unauthorized");
  if (/403/.test(content)) codes.push("403 Forbidden");
  if (/404/.test(content)) codes.push("404 Not Found");
  if (/500/.test(content)) codes.push("500 Internal Server Error");

  if (codes.length === 0) {
    codes.push("200 OK");
    if (method !== "GET") codes.push("400 Bad Request");
  }
  return codes;
}

function inferRequestBody(method: HttpMethod, content: string): ApiParam[] | undefined {
  if (method === "GET" || method === "DELETE" || method === "HEAD") return undefined;

  const fields: ApiParam[] = [];

  // Look for destructured body fields: const { name, email } = await req.json()
  const destructureRe = /const\s*\{([^}]+)\}\s*=\s*(?:await\s+)?(?:req|request)\.json\(\)/;
  const destructureMatch = destructureRe.exec(content);
  if (destructureMatch) {
    const names = destructureMatch[1].split(",").map((s) => s.trim().replace(/:.+$/, "").trim()).filter(Boolean);
    names.forEach((name) => {
      if (!name) return;
      // Infer type from nearby usage
      const typeHint = /email/.test(name) ? "string (email)" : /id/.test(name) ? "string" : /count|amount|price/.test(name) ? "number" : "string";
      fields.push({ name, type: typeHint, required: true, description: `The ${name} field` });
    });
  }

  // Also look for zod schema fields: z.object({ name: z.string(), ... })
  const zodRe = /z\.object\s*\(\s*\{([^}]+)\}/;
  const zodMatch = zodRe.exec(content);
  if (zodMatch && fields.length === 0) {
    const zodFields = zodMatch[1].split(",").map((s) => s.trim());
    zodFields.forEach((f) => {
      const fm = /(\w+)\s*:\s*z\.(\w+)/.exec(f);
      if (fm) {
        fields.push({ name: fm[1], type: fm[2], required: !f.includes(".optional()"), description: `The ${fm[1]} field` });
      }
    });
  }

  return fields.length > 0 ? fields : undefined;
}

function inferQueryParams(content: string): ApiParam[] | undefined {
  const params: ApiParam[] = [];
  // searchParams.get("key") or url.searchParams.get("key")
  const re = /searchParams\.get\(['"](\w+)['"]\)/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(content)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      params.push({ name: m[1], type: "string", required: false, description: `Filter by ${m[1]}` });
    }
  }
  return params.length > 0 ? params : undefined;
}

function inferResponseShape(method: HttpMethod, path: string, content: string): string {
  const resource = path.split("/").filter((s) => !s.startsWith("[")).pop() ?? "data";

  // Try to find NextResponse.json({ ... }) shapes
  const jsonRe = /NextResponse\.json\s*\(\s*\{([^}]{1,300})\}/;
  const jsonMatch = jsonRe.exec(content);
  if (jsonMatch) {
    // Clean up and truncate
    const raw = jsonMatch[1].replace(/\s+/g, " ").slice(0, 200);
    return `{ ${raw.trim()} }`;
  }

  // Generic shapes based on method
  if (method === "GET") {
    return path.includes("[")
      ? `{ ${resource.replace(/s$/, "")}: { id, ...fields }, ok: true }`
      : `{ ${resource}: [...], count: number }`;
  }
  if (method === "POST") return `{ ${resource.replace(/s$/, "")}: { id, ...fields }, ok: true }`;
  if (method === "DELETE") return `{ ok: true }`;
  return `{ ok: true, data: { ...fields } }`;
}

function parseRouteFiles(files: ProjectFile[]): ApiEndpoint[] {
  const routeFiles = files.filter(
    (f) =>
      f.path.includes("/api/") &&
      /\/route\.[jt]sx?$/.test(f.path)
  );

  const endpoints: ApiEndpoint[] = [];
  const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

  for (const file of routeFiles) {
    const content = file.content ?? "";
    const apiPath = filePathToApiPath(file.path);
    const pathParams = extractPathParams(apiPath);

    for (const method of METHODS) {
      // Check if this method is exported from the route
      const exported =
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`).test(content) ||
        new RegExp(`export\\s+const\\s+${method}\\s*=`).test(content);
      if (!exported) continue;

      endpoints.push({
        path: apiPath,
        method,
        description: inferDescription(method, apiPath),
        pathParams: pathParams.length > 0 ? pathParams : undefined,
        queryParams: inferQueryParams(content),
        requestBody: inferRequestBody(method, content),
        responseShape: inferResponseShape(method, apiPath, content),
        sourceFile: file.path,
        statusCodes: inferStatusCodes(method, content),
      });
    }
  }

  return endpoints.sort((a, b) => a.path.localeCompare(b.path));
}

// ─── OpenAPI generator ────────────────────────────────────────────────────────

function toOpenApi(endpoints: ApiEndpoint[]): string {
  const paths: Record<string, unknown> = {};

  for (const ep of endpoints) {
    const oaPath = ep.path.replace(/\[([^\]]+)\]/g, "{$1}");
    if (!paths[oaPath]) paths[oaPath] = {};
    const pathItem = paths[oaPath] as Record<string, unknown>;

    const op: Record<string, unknown> = {
      summary: ep.description,
      operationId: `${ep.method.toLowerCase()}_${oaPath.replace(/\//g, "_").replace(/[{}]/g, "").slice(1)}`,
      tags: [oaPath.split("/")[2] ?? "default"],
      parameters: [
        ...(ep.pathParams ?? []).map((p) => ({
          in: "path", name: p.name, required: true,
          schema: { type: "string" }, description: p.description,
        })),
        ...(ep.queryParams ?? []).map((p) => ({
          in: "query", name: p.name, required: p.required,
          schema: { type: "string" }, description: p.description,
        })),
      ],
      responses: Object.fromEntries(
        ep.statusCodes.map((s) => [s.split(" ")[0], { description: s.slice(4) }])
      ),
    };

    if (ep.requestBody) {
      op.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: Object.fromEntries(
                ep.requestBody.map((p) => [p.name, { type: p.type, description: p.description }])
              ),
              required: ep.requestBody.filter((p) => p.required).map((p) => p.name),
            },
          },
        },
      };
    }

    pathItem[ep.method.toLowerCase()] = op;
  }

  return JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Project API", version: "1.0.0" },
    paths,
  }, null, 2);
}

// ─── Endpoint Card ────────────────────────────────────────────────────────────

interface EndpointCardProps {
  endpoint: ApiEndpoint;
}

function EndpointCard({ endpoint: ep }: EndpointCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${METHOD_STYLES[ep.method]}`}>
          {ep.method}
        </span>
        <span className="text-xs font-mono flex-1 truncate">{ep.path}</span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-border/40 divide-y divide-border/30">
          {/* Description */}
          <div className="px-3 py-2">
            <p className="text-xs text-muted-foreground">{ep.description}</p>
            <p className="text-[9px] text-muted-foreground/50 font-mono mt-1">{ep.sourceFile}</p>
          </div>

          {/* Path params */}
          {ep.pathParams && ep.pathParams.length > 0 && (
            <div className="px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Path params</p>
              {ep.pathParams.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <code className="text-[10px] font-mono text-violet-400">{p.name}</code>
                  <span className="text-[9px] text-muted-foreground">{p.type}</span>
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-auto">required</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Query params */}
          {ep.queryParams && ep.queryParams.length > 0 && (
            <div className="px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Query params</p>
              {ep.queryParams.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <code className="text-[10px] font-mono text-sky-400">{p.name}</code>
                  <span className="text-[9px] text-muted-foreground">{p.type}</span>
                  {!p.required && <span className="text-[9px] text-muted-foreground/50 ml-auto">optional</span>}
                </div>
              ))}
            </div>
          )}

          {/* Request body */}
          {ep.requestBody && ep.requestBody.length > 0 && (
            <div className="px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Request body</p>
              {ep.requestBody.map((p) => (
                <div key={p.name} className="flex items-center gap-2">
                  <code className="text-[10px] font-mono text-amber-400">{p.name}</code>
                  <span className="text-[9px] text-muted-foreground">{p.type}</span>
                  {p.required
                    ? <Badge variant="outline" className="text-[8px] h-3.5 px-1 ml-auto border-amber-500/30 text-amber-400">required</Badge>
                    : <span className="text-[9px] text-muted-foreground/50 ml-auto">optional</span>}
                </div>
              ))}
            </div>
          )}

          {/* Response */}
          <div className="px-3 py-2 space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Response</p>
            <pre className="text-[9px] font-mono bg-muted/40 rounded px-2 py-1.5 overflow-x-auto text-muted-foreground leading-relaxed">
              {ep.responseShape}
            </pre>
          </div>

          {/* Status codes */}
          <div className="px-3 py-2 flex flex-wrap gap-1">
            {ep.statusCodes.map((s) => {
              const code = parseInt(s);
              const color = code < 300 ? "text-emerald-400 border-emerald-500/20" : code < 400 ? "text-sky-400 border-sky-500/20" : "text-red-400 border-red-500/20";
              return (
                <Badge key={s} variant="outline" className={`text-[9px] h-4 px-1.5 ${color}`}>{s}</Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface ApiDocsPanelProps {
  files: ProjectFile[];
}

export function ApiDocsPanel({ files }: ApiDocsPanelProps) {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<HttpMethod | "ALL">("ALL");
  const [copied, setCopied] = useState(false);

  const endpoints = useMemo(() => parseRouteFiles(files), [files]);

  const filtered = useMemo(() => {
    return endpoints.filter((ep) => {
      const matchSearch =
        ep.path.toLowerCase().includes(search.toLowerCase()) ||
        ep.description.toLowerCase().includes(search.toLowerCase());
      const matchMethod = methodFilter === "ALL" || ep.method === methodFilter;
      return matchSearch && matchMethod;
    });
  }, [endpoints, search, methodFilter]);

  // Group by base resource (first segment after /api/)
  const grouped = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>();
    for (const ep of filtered) {
      const parts = ep.path.split("/").filter(Boolean);
      const group = parts[1] ?? "root"; // e.g. "projects" from /api/projects/[id]
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(ep);
    }
    return map;
  }, [filtered]);

  function handleCopyOpenApi() {
    void navigator.clipboard.writeText(toOpenApi(endpoints));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadOpenApi() {
    const blob = new Blob([toOpenApi(endpoints)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "openapi.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const FILTER_METHODS: (HttpMethod | "ALL")[] = ["ALL", "GET", "POST", "PATCH", "PUT", "DELETE"];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <FileCode2 className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">API Docs</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {endpoints.length} endpoint{endpoints.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search endpoints…"
            className="h-7 pl-6 text-xs"
          />
        </div>
        <Button
          size="sm" variant="outline"
          className="h-7 text-xs gap-1 px-2 shrink-0"
          onClick={handleCopyOpenApi}
          title="Copy as OpenAPI JSON"
          disabled={endpoints.length === 0}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </Button>
        <Button
          size="sm" variant="outline"
          className="h-7 text-xs gap-1 px-2 shrink-0"
          onClick={handleDownloadOpenApi}
          title="Download openapi.json"
          disabled={endpoints.length === 0}
        >
          <Download className="w-3 h-3" />
        </Button>
      </div>

      {/* Method filter chips */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/40 overflow-x-auto shrink-0">
        {FILTER_METHODS.map((m) => (
          <button
            key={m}
            onClick={() => setMethodFilter(m)}
            className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 transition-all ${
              methodFilter === m
                ? m === "ALL"
                  ? "bg-muted border-border text-foreground"
                  : METHOD_STYLES[m as HttpMethod]
                : "border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {endpoints.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                <FileCode2 className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-sm font-medium">No API routes found</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Add route handlers at <code className="font-mono">app/api/**/route.ts</code> and they&apos;ll appear here.
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No endpoints match your filter.</p>
          ) : (
            Array.from(grouped.entries()).map(([group, eps]) => (
              <div key={group} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="w-3 h-3 text-muted-foreground" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[9px] text-muted-foreground">{eps.length}</span>
                </div>
                {eps.map((ep) => (
                  <EndpointCard key={`${ep.method}:${ep.path}`} endpoint={ep} />
                ))}
              </div>
            ))
          )}

          {/* Footer hint */}
          {endpoints.length > 0 && (
            <p className="text-[9px] text-muted-foreground/60 text-center pb-2">
              Schemas are inferred from static analysis. Export as OpenAPI 3.0 JSON for use with Swagger UI or Postman.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
