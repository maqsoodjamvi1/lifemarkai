import { randomBytes } from "node:crypto";

export interface TraceContext {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

export interface TraceSpanOptions {
  parent?: TraceContext | null;
  attributes?: Record<string, string | number | boolean | null | undefined>;
}

function hex(bytes: number) {
  return randomBytes(bytes).toString("hex");
}

export function parseTraceparent(value?: string | null): TraceContext | null {
  if (!value) return null;
  const match = value.trim().match(/^00-([a-f0-9]{32})-([a-f0-9]{16})-([a-f0-9]{2})$/i);
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1].toLowerCase(), spanId: match[2].toLowerCase(), sampled: (parseInt(match[3], 16) & 1) === 1 };
}

export function createTraceContext(parent?: TraceContext | null): TraceContext {
  return { traceId: parent?.traceId ?? hex(16), spanId: hex(8), sampled: parent?.sampled ?? true };
}

export function traceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? "01" : "00"}`;
}

function otlpEndpoint(): string | null {
  const base = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!base) return null;
  return base.endsWith("/v1/traces") ? base : `${base.replace(/\/$/, "")}/v1/traces`;
}

function attributes(values: TraceSpanOptions["attributes"] = {}) {
  return Object.entries(values)
    .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
    .map(([key, value]) => ({ key, value: typeof value === "boolean" ? { boolValue: value } : typeof value === "number" ? { doubleValue: value } : { stringValue: value } }));
}

async function exportSpan(input: {
  name: string;
  context: TraceContext;
  parentSpanId?: string;
  started: bigint;
  ended: bigint;
  attributes?: TraceSpanOptions["attributes"];
  error?: unknown;
}) {
  const endpoint = otlpEndpoint();
  if (!endpoint || !input.context.sampled) return;
  const body = {
    resourceSpans: [{
      resource: { attributes: attributes({ "service.name": process.env.OTEL_SERVICE_NAME ?? "lifemarkai", "service.version": process.env.npm_package_version ?? "unknown" }) },
      scopeSpans: [{
        scope: { name: "lifemarkai.runtime", version: "1" },
        spans: [{
          traceId: input.context.traceId,
          spanId: input.context.spanId,
          parentSpanId: input.parentSpanId,
          name: input.name,
          kind: 1,
          startTimeUnixNano: input.started.toString(),
          endTimeUnixNano: input.ended.toString(),
          attributes: attributes(input.attributes),
          status: input.error ? { code: 2, message: input.error instanceof Error ? input.error.message : String(input.error) } : { code: 1 },
        }],
      }],
    }],
  };
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (process.env.OTEL_EXPORTER_OTLP_HEADERS) {
    for (const item of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(",")) {
      const index = item.indexOf("=");
      if (index > 0) headers[item.slice(0, index).trim()] = item.slice(index + 1).trim();
    }
  }
  try {
    await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  } catch (error) {
    console.warn("[Tracing] OTLP export failed:", error instanceof Error ? error.message : error);
  }
}

export async function withTraceSpan<T>(name: string, options: TraceSpanOptions, operation: (context: TraceContext) => Promise<T>): Promise<T> {
  const context = createTraceContext(options.parent);
  const started = BigInt(Date.now()) * 1_000_000n;
  let failure: unknown;
  try {
    return await operation(context);
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    await exportSpan({ name, context, parentSpanId: options.parent?.spanId, started, ended: BigInt(Date.now()) * 1_000_000n, attributes: options.attributes, error: failure });
  }
}
