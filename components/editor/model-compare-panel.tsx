"use client";

import { useState, useRef } from "react";
import { Layers, Play, Loader2, Copy, Check, ChevronRight, Clock, Zap, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface ModelComparePanelProps {
  projectId: string;
  onSendToChat: (prompt: string) => void;
}

interface ModelResult {
  model: string;
  label: string;
  content: string;
  durationMs: number;
  tokenEstimate: number;
  streaming: boolean;
  error?: string;
}

const MODELS: { id: string; label: string; color: string }[] = [
  { id: "gpt-4o",                label: "GPT-4o",           color: "text-emerald-400 border-emerald-500/30" },
  { id: "claude-opus-4-6",   label: "Claude Opus 4.6", color: "text-violet-400 border-violet-500/30" },
];

const SAMPLE_PROMPTS = [
  "Build a responsive navbar with a hamburger menu for mobile",
  "Write a TypeScript function to debounce API calls",
  "Create a Supabase RLS policy for a multi-tenant app",
  "Generate a complete login form with Zod validation",
];

async function streamModel(
  prompt: string,
  model: string,
  projectId: string,
  onChunk: (chunk: string) => void,
  signal: AbortSignal
): Promise<{ durationMs: number; tokenEstimate: number }> {
  const start = Date.now();
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      model,
      mode: "chat",
      projectId,
    }),
    signal,
  });

  if (!res.ok || !res.body) throw new Error("Request failed");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") break;
      try {
        const p = JSON.parse(data) as { content?: string };
        if (p.content) { full += p.content; onChunk(p.content); }
      } catch { /* skip */ }
    }
  }

  return {
    durationMs: Date.now() - start,
    tokenEstimate: Math.ceil(full.length / 4),
  };
}

export function ModelComparePanel({ projectId, onSendToChat }: ModelComparePanelProps) {
  const [prompt, setPrompt] = useState("");
  const [results, setResults] = useState<ModelResult[]>(
    MODELS.map((m) => ({ model: m.id, label: m.label, content: "", durationMs: 0, tokenEstimate: 0, streaming: false }))
  );
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runComparison() {
    if (!prompt.trim() || running) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRunning(true);

    // Reset results
    setResults(MODELS.map((m) => ({ model: m.id, label: m.label, content: "", durationMs: 0, tokenEstimate: 0, streaming: true })));

    const promises = MODELS.map(async (m) => {
      try {
        const { durationMs, tokenEstimate } = await streamModel(
          prompt,
          m.id,
          projectId,
          (chunk) => {
            setResults((prev) =>
              prev.map((r) => r.model === m.id ? { ...r, content: r.content + chunk } : r)
            );
          },
          ctrl.signal
        );
        setResults((prev) =>
          prev.map((r) => r.model === m.id ? { ...r, durationMs, tokenEstimate, streaming: false } : r)
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setResults((prev) =>
          prev.map((r) => r.model === m.id ? { ...r, streaming: false, error: "Request failed" } : r)
        );
      }
    });

    await Promise.all(promises);
    setRunning(false);
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
    setResults((prev) => prev.map((r) => ({ ...r, streaming: false })));
  }

  function copyResult(model: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(model);
    setTimeout(() => setCopied(null), 2000);
  }

  function useResult(content: string) {
    onSendToChat(`Use this response as context for the next change:\n\n${content.slice(0, 2000)}`);
    toast({ title: "Sent to chat" });
  }

  const modelInfo = (id: string) => MODELS.find((m) => m.id === id);

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h2 className="font-semibold text-foreground">Model Compare</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {MODELS.length} models
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Run the same prompt through GPT-4o and Claude side-by-side</p>
      </div>

      {/* Prompt input */}
      <div className="p-3 border-b border-border space-y-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runComparison(); }}
          placeholder="Enter a prompt to compare across models…"
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-cyan-500/40"
        />
        {/* Sample chips */}
        <div className="flex gap-1.5 flex-wrap">
          {SAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors max-w-[150px] truncate"
            >
              {ex}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={running ? stop : runComparison}
            disabled={!prompt.trim() && !running}
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {running ? "Stop" : "Compare"}
            {!running && <span className="text-[10px] opacity-60 ml-auto">⌘↵</span>}
          </Button>
        </div>
      </div>

      {/* Results — stacked columns */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/50">
        {results.map((result) => {
          const info = modelInfo(result.model);
          const hasContent = result.content.length > 0;
          const isFastest = results.every((r) => !r.streaming) && result.durationMs > 0 &&
            result.durationMs === Math.min(...results.filter((r) => r.durationMs > 0).map((r) => r.durationMs));

          return (
            <div key={result.model} className="p-3 space-y-2">
              {/* Model header */}
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`text-[10px] h-5 px-2 ${info?.color ?? "border-border text-muted-foreground"}`}>
                  {result.label}
                </Badge>
                {result.streaming && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                {!result.streaming && result.durationMs > 0 && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> {(result.durationMs / 1000).toFixed(1)}s
                  </span>
                )}
                {isFastest && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-yellow-500/40 text-yellow-400">
                    <Zap className="w-2.5 h-2.5 mr-0.5" />fastest
                  </Badge>
                )}
                {hasContent && (
                  <div className="ml-auto flex gap-1">
                    <button onClick={() => copyResult(result.model, result.content)} className="text-muted-foreground hover:text-foreground p-0.5">
                      {copied === result.model ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => useResult(result.content)} className="text-muted-foreground hover:text-foreground p-0.5" title="Send to chat">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Content */}
              {result.error ? (
                <p className="text-[11px] text-red-400 italic">{result.error}</p>
              ) : hasContent ? (
                <div className="rounded-lg bg-muted/20 border border-border/50 p-2.5 max-h-64 overflow-y-auto">
                  <p className="text-[11px] text-foreground/90 whitespace-pre-wrap leading-relaxed">{result.content}</p>
                </div>
              ) : !result.streaming ? (
                <div className="rounded-lg bg-muted/10 border border-dashed border-border p-4 text-center">
                  <p className="text-[10px] text-muted-foreground">Run a comparison to see results</p>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/10 border border-border/50 p-3 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">Streaming…</span>
                </div>
              )}

              {!result.streaming && result.tokenEstimate > 0 && (
                <p className="text-[10px] text-muted-foreground">~{result.tokenEstimate.toLocaleString()} tokens · {result.content.length} chars</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
