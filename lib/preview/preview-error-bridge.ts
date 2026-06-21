/**
 * Injected into Vite preview (WebContainer iframe) to capture runtime +
 * bundler errors and post them to the parent editor for self-healing loops.
 */

export const PREVIEW_ERROR_BRIDGE_SCRIPT = `(function() {
  if (window.parent === window) return;

  var sent = {};
  function dedupe(msg) {
    if (sent[msg]) return false;
    sent[msg] = 1;
    return true;
  }

  function emit(kind, message, extra) {
    if (!message || !dedupe(kind + ":" + message)) return;
    try {
      window.parent.postMessage({
        source: "lifemark-preview-errors",
        type: "preview-error",
        kind: kind,
        message: String(message),
        extra: extra || {},
        url: location.href,
        timestamp: Date.now()
      }, "*");
    } catch (e) {}
  }

  window.addEventListener("error", function(e) {
    emit("runtime", e.message || "Unknown error", {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno
    });
  });

  window.addEventListener("unhandledrejection", function(e) {
    var msg = e.reason && (e.reason.message || String(e.reason)) || "Unhandled rejection";
    emit("promise", msg, {});
  });

  var _err = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var text = args.map(function(a){ return typeof a === "string" ? a : (a && a.message) || ""; }).join(" ");
    if (/\\[vite\\]|Failed to compile|Pre-transform error|SyntaxError|Transform failed/i.test(text)) {
      emit("bundler", text, { args: args.slice(0, 3) });
    }
    return _err.apply(console, args);
  };

  setTimeout(function() {
    var root = document.getElementById("root");
    if (root && !root.innerHTML.trim()) {
      emit("empty-root", "Preview root is empty — app may have crashed during mount", {});
    }
  }, 4000);

  window.parent.postMessage({ source: "lifemark-preview-errors", type: "preview-error-ready" }, "*");
})();`;

export type PreviewErrorKind = "runtime" | "promise" | "bundler" | "empty-root" | "console";

export interface PreviewRuntimeError {
  kind: PreviewErrorKind;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  url?: string;
  timestamp: number;
}

export interface PreviewErrorReport {
  errors: PreviewRuntimeError[];
  formatted: string;
  hasFatal: boolean;
}

const BUNDLER_RE = /\[vite\]|failed to compile|pre-transform|syntaxerror|transform failed|unexpected token/i;

export function isBundlerError(message: string): boolean {
  return BUNDLER_RE.test(message);
}

export function formatErrorsForHealing(errors: PreviewRuntimeError[]): string {
  if (errors.length === 0) return "";
  return errors
    .map((e, i) => {
      const loc = e.filename ? ` (${e.filename}:${e.lineno ?? "?"})` : "";
      return `${i + 1}. [${e.kind}] ${e.message}${loc}`;
    })
    .join("\n");
}

export function buildHealingPrompt(errors: PreviewRuntimeError[]): string {
  const log = formatErrorsForHealing(errors);
  return [
    "Fix the preview/runtime errors below. Apply minimal surgical patches only.",
    "Use <file_update> with <search> and <replace> when possible.",
    "",
    "```",
    log,
    "```",
  ].join("\n");
}

export function parsePreviewErrorMessage(data: unknown): PreviewRuntimeError | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "lifemark-preview-errors" || d.type !== "preview-error") return null;
  const extra = (d.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>;
  return {
    kind: (d.kind as PreviewErrorKind) ?? "runtime",
    message: String(d.message ?? ""),
    filename: extra.filename as string | undefined,
    lineno: extra.lineno as number | undefined,
    colno: extra.colno as number | undefined,
    url: d.url as string | undefined,
    timestamp: Number(d.timestamp) || Date.now(),
  };
}
