"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Info, XCircle, Sparkles, Loader2, ChevronDown, ExternalLink } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarkerData {
  message: string;
  severity: number; // 8=error, 4=warning, 2=info
  startLineNumber: number;
  startColumn: number;
  source?: string;
  code?: string | { value: string; target: { toString(): string } };
  resource?: { path?: string };
}

interface ExplainState {
  loading: boolean;
  text: string;
}

// ── Severity helpers ──────────────────────────────────────────────────────────

function severityLabel(s: number) {
  if (s === 8) return "Error";
  if (s === 4) return "Warning";
  return "Info";
}

function SeverityIcon({ severity }: { severity: number }) {
  if (severity === 8) return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (severity === 4) return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
}

function severityBg(s: number) {
  if (s === 8) return "border-red-500/20 bg-red-500/5";
  if (s === 4) return "border-amber-500/20 bg-amber-500/5";
  return "border-blue-500/20 bg-blue-500/5";
}

// ── Single Problem Row ────────────────────────────────────────────────────────

function ProblemRow({
  marker,
  filePath,
  projectId,
}: {
  marker: MarkerData;
  filePath: string;
  projectId: string;
}) {
  const [explain, setExplain] = useState<ExplainState | null>(null);
  const [open, setOpen] = useState(false);

  const codeStr = typeof marker.code === "object"
    ? marker.code?.value ?? ""
    : marker.code ?? "";

  async function handleExplain() {
    if (explain?.text) { setOpen((v) => !v); return; }
    setExplain({ loading: true, text: "" });
    setOpen(true);

    const prompt = [
      `Explain this TypeScript/React error concisely (2-3 sentences max). Tell me what causes it and how to fix it.`,
      ``,
      `File: ${filePath}`,
      `Line ${marker.startLineNumber}, Column ${marker.startColumn}`,
      `Severity: ${severityLabel(marker.severity)}${codeStr ? ` (TS${codeStr})` : ""}`,
      `Message: ${marker.message}`,
    ].join("\n");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message: prompt,
          mode: "chat",
          files: [],
        }),
      });

      if (!res.ok || !res.body) throw new Error("API error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk" && data.content) {
              accumulated += data.content;
              setExplain({ loading: false, text: accumulated });
            }
          } catch { /* ignore */ }
        }
      }

      if (!accumulated) setExplain({ loading: false, text: "No explanation available." });
    } catch {
      setExplain({ loading: false, text: "Failed to get explanation. Please try again." });
    }
  }

  function jumpToLine() {
    window.dispatchEvent(new CustomEvent("monaco-reveal-line", {
      detail: { line: marker.startLineNumber },
    }));
  }

  return (
    <div className={`border rounded-lg overflow-hidden ${severityBg(marker.severity)}`}>
      {/* Main row */}
      <div
        className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={jumpToLine}
      >
        <SeverityIcon severity={marker.severity} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground leading-snug">{marker.message}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-muted-foreground font-mono">
              {filePath.split("/").pop() ?? filePath} :{marker.startLineNumber}
            </span>
            {codeStr && (
              <span className="text-[10px] text-muted-foreground/60 font-mono">TS{codeStr}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={jumpToLine}
            title="Go to line"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
          </button>
          <button
            onClick={handleExplain}
            title="Explain with AI"
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              open
                ? "bg-violet-500/20 text-violet-300"
                : "text-muted-foreground hover:text-violet-300 hover:bg-violet-500/10"
            }`}
          >
            {explain?.loading ? (
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
            ) : (
              <Sparkles className="w-2.5 h-2.5" />
            )}
            Explain
            {explain?.text && (
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${open ? "" : "-rotate-90"}`} />
            )}
          </button>
        </div>
      </div>

      {/* Explanation area */}
      <AnimatePresence>
        {open && explain && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2.5 pt-0 border-t border-white/[0.06]">
              {explain.loading ? (
                <div className="flex items-center gap-1.5 py-1">
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400" />
                  <span className="text-[11px] text-muted-foreground">Thinking…</span>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap mt-1.5">
                  {explain.text}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

interface ProblemsPanelProps {
  projectId: string;
}

export function ProblemsPanel({ projectId }: ProblemsPanelProps) {
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [filePath, setFilePath] = useState("");

  useEffect(() => {
    const handler = (e: Event) => {
      const { markers: m, filePath: fp } = (e as CustomEvent).detail as {
        markers: MarkerData[];
        filePath: string;
      };
      setMarkers(m ?? []);
      setFilePath(fp ?? "");
    };
    window.addEventListener("monaco-markers-change", handler);
    return () => window.removeEventListener("monaco-markers-change", handler);
  }, []);

  const errors   = markers.filter((m) => m.severity === 8);
  const warnings = markers.filter((m) => m.severity === 4);
  const infos    = markers.filter((m) => m.severity < 4);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-semibold">Problems</span>
          {markers.length > 0 && (
            <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-mono">
              {markers.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {errors.length > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <XCircle className="w-3 h-3" />{errors.length}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3 h-3" />{warnings.length}
            </span>
          )}
          {infos.length > 0 && (
            <span className="flex items-center gap-1 text-blue-400">
              <Info className="w-3 h-3" />{infos.length}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {markers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center mb-3">
              <span className="text-xl">✓</span>
            </div>
            <p className="text-sm font-medium text-foreground">No problems</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filePath
                ? `${filePath.split("/").pop()} looks good`
                : "Open a file in the editor to see diagnostics"}
            </p>
          </div>
        ) : (
          <>
            {filePath && (
              <p className="text-[10px] text-muted-foreground font-mono px-1 pb-1">
                {filePath}
              </p>
            )}
            {markers.map((m, i) => (
              <ProblemRow
                key={`${m.startLineNumber}-${m.startColumn}-${i}`}
                marker={m}
                filePath={filePath}
                projectId={projectId}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
