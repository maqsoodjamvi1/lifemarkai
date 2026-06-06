"use client";

import { useState } from "react";
import { Wand2, Loader2, Copy, Check, ChevronRight, Sparkles, BarChart3, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface PromptOptimizerPanelProps {
  onSendToChat: (prompt: string) => void;
}

interface ScoreBreakdown {
  clarity: number;       // 0-10
  specificity: number;
  conciseness: number;
  actionability: number;
}

interface PromptVariant {
  title: string;
  prompt: string;
  rationale: string;
  scores: ScoreBreakdown;
  overall: number;       // 0-100
}

const SCORE_COLOR = (n: number) =>
  n >= 8 ? "text-emerald-400" : n >= 6 ? "text-yellow-400" : "text-red-400";

const SCORE_BAR = (n: number) =>
  n >= 8 ? "bg-emerald-500" : n >= 6 ? "bg-yellow-500" : "bg-red-500";

const EXAMPLE_PROMPTS = [
  "add authentication",
  "make it look better",
  "build a dashboard with charts and data",
  "fix the bug",
];

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className={`text-[10px] font-mono font-bold ${SCORE_COLOR(value)}`}>{value}/10</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${SCORE_BAR(value)}`} style={{ width: `${value * 10}%` }} />
      </div>
    </div>
  );
}

export function PromptOptimizerPanel({ onSendToChat }: PromptOptimizerPanelProps) {
  const [input, setInput] = useState("");
  const [variants, setVariants] = useState<PromptVariant[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);

  async function optimize() {
    if (!input.trim() || loading) return;
    if (loading) { abortCtrl?.abort(); return; }

    const ctrl = new AbortController();
    setAbortCtrl(ctrl);
    setLoading(true);
    setVariants([]);

    const systemPrompt = `You are an expert at crafting effective AI prompts for a code generation tool.

Given a vague or basic prompt, produce EXACTLY 3 improved variants in JSON.

Return ONLY valid JSON with this shape:
{
  "variants": [
    {
      "title": "Short variant name (3-5 words)",
      "prompt": "The full improved prompt text",
      "rationale": "One sentence explaining what was improved",
      "scores": {
        "clarity": <1-10>,
        "specificity": <1-10>,
        "conciseness": <1-10>,
        "actionability": <1-10>
      },
      "overall": <0-100>
    }
  ]
}

Rules:
- Variant 1: Minimally improved — fix vagueness while keeping it short
- Variant 2: Detailed — add technical specifics (stack, styling, behaviour)
- Variant 3: Comprehensive — include context, constraints, edge cases, and desired output format
- Score each variant honestly
- overall = weighted average of scores × 2.5
- Keep prompts actionable and code-generation focused`;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Original prompt: "${input.trim()}"` }],
          model: "gpt-4o",
          system: systemPrompt,
          mode: "chat",
          projectId: "optimizer",
          response_format: { type: "json_object" },
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data) as { content?: string };
            if (parsed.content) accumulated += parsed.content;
          } catch { /* skip */ }
        }
      }

      const match = accumulated.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON in response");
      const parsed = JSON.parse(match[0]) as { variants?: PromptVariant[] };
      const result = parsed.variants ?? [];
      setVariants(result);
      if (result.length > 0) setExpanded(0);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ title: "Optimization failed", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }

  function copyVariant(i: number) {
    navigator.clipboard.writeText(variants[i].prompt);
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  }

  function sendVariant(i: number) {
    onSendToChat(variants[i].prompt);
    toast({ title: "Sent to chat", description: variants[i].title });
  }

  const overallColor = (n: number) =>
    n >= 75 ? "text-emerald-400" : n >= 50 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Wand2 className="w-4 h-4 text-fuchsia-400" />
          <h2 className="font-semibold text-foreground">Prompt Optimizer</h2>
          {variants.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-fuchsia-500/30 text-fuchsia-400">
              {variants.length} variants
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Turn vague prompts into precise, effective ones</p>
      </div>

      {/* Input area */}
      <div className="p-3 border-b border-border space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") optimize(); }}
          placeholder="Enter a prompt to optimize…"
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-fuchsia-500/40"
        />
        {/* Example chips */}
        <div className="flex gap-1.5 flex-wrap">
          {EXAMPLE_PROMPTS.map((ex) => (
            <button
              key={ex}
              onClick={() => setInput(ex)}
              className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          className="w-full gap-1.5"
          onClick={optimize}
          disabled={!input.trim()}
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {loading ? "Optimizing…" : "Optimize Prompt"}
          {!loading && <span className="text-[10px] opacity-60 ml-auto">⌘↵</span>}
        </Button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading && (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-6 h-6 animate-spin text-fuchsia-400" />
            <p className="text-xs text-muted-foreground">Generating optimized variants…</p>
          </div>
        )}

        {!loading && variants.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Wand2 className="w-7 h-7 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">No variants yet</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Enter a prompt above and click Optimize to get 3 improved versions with quality scores.
            </p>
          </div>
        )}

        {variants.map((variant, i) => (
          <div key={i} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
            {/* Variant header */}
            <button
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">v{i + 1}</span>
              <span className="text-xs font-semibold text-foreground flex-1 text-left">{variant.title}</span>
              <span className={`text-sm font-bold ${overallColor(variant.overall)}`}>{variant.overall}</span>
              <BarChart3 className="w-3 h-3 text-muted-foreground shrink-0" />
              {expanded === i
                ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground rotate-90 transition-transform" />
                : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground transition-transform" />}
            </button>

            {expanded === i && (
              <div className="px-3 pb-3 space-y-3 border-t border-border pt-3">
                {/* Prompt text */}
                <div className="rounded-lg bg-muted/30 p-2.5">
                  <p className="text-xs text-foreground leading-relaxed">{variant.prompt}</p>
                </div>

                {/* Rationale */}
                <p className="text-[10px] text-muted-foreground italic">{variant.rationale}</p>

                {/* Score bars */}
                <div className="space-y-1.5">
                  <ScoreBar label="Clarity" value={variant.scores.clarity} />
                  <ScoreBar label="Specificity" value={variant.scores.specificity} />
                  <ScoreBar label="Conciseness" value={variant.scores.conciseness} />
                  <ScoreBar label="Actionability" value={variant.scores.actionability} />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 text-xs h-7" onClick={() => copyVariant(i)}>
                    {copied === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    Copy
                  </Button>
                  <Button size="sm" className="flex-1 gap-1 text-xs h-7" onClick={() => sendVariant(i)}>
                    <Send className="w-3 h-3" /> Use in Chat
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {variants.length > 0 && !loading && (
          <Button size="sm" variant="outline" className="w-full gap-1.5 mt-1" onClick={optimize}>
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate variants
          </Button>
        )}
      </div>
    </div>
  );
}
