"use client";

import { useState, useRef } from "react";
import {
  Palette, Check, Sparkles, ArrowRight, Loader2,
  RefreshCw, Wand2, AlertTriangle,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface DesignDirectionsPanelProps {
  onSendToChat?: (prompt: string) => void;
  initialPrompt?: string;
}

interface DesignDirection {
  id: string;
  label: string;
  description: string;
  html: string;
}

// ── Fallback static directions (shown before the user generates) ──────────────
const STATIC_FALLBACKS: DesignDirection[] = [
  {
    id: "minimal",
    label: "Clean & Minimal",
    description: "Whitespace-forward, subtle borders, muted palette",
    html: `<script src="https://cdn.tailwindcss.com"></script>
<body class="m-0 p-4 bg-white overflow-hidden font-sans">
  <div class="border border-gray-200 rounded-xl p-4 space-y-2">
    <div class="flex items-center gap-2 mb-3">
      <div class="w-6 h-6 rounded-lg bg-gray-100 border border-gray-200"></div>
      <span class="text-xs font-semibold text-gray-800 tracking-wide uppercase">Dashboard</span>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
        <div class="text-[10px] text-gray-400 mb-1">Total users</div>
        <div class="text-lg font-semibold text-gray-900">2,481</div>
      </div>
      <div class="bg-gray-50 rounded-lg p-2.5 border border-gray-100">
        <div class="text-[10px] text-gray-400 mb-1">Revenue</div>
        <div class="text-lg font-semibold text-gray-900">$12.4k</div>
      </div>
    </div>
    <button class="w-full mt-2 text-xs py-1.5 px-3 rounded-lg border border-gray-200 text-gray-600">View report</button>
  </div>
</body>`,
  },
  {
    id: "bold",
    label: "Bold & Vibrant",
    description: "Saturated accents, strong contrast, high energy",
    html: `<script src="https://cdn.tailwindcss.com"></script>
<body class="m-0 p-4 overflow-hidden font-sans" style="background:linear-gradient(135deg,#7c3aed,#4338ca)">
  <div class="rounded-xl p-4 border space-y-2" style="background:rgba(255,255,255,0.12);border-color:rgba(255,255,255,0.2)">
    <div class="flex items-center gap-2 mb-3">
      <div class="w-6 h-6 rounded-lg bg-yellow-400"></div>
      <span class="text-xs font-black text-white tracking-widest uppercase">Dashboard</span>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-lg p-2.5" style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.1)">
        <div class="text-[10px] text-violet-200 mb-1">Users</div>
        <div class="text-lg font-black text-white">2,481</div>
      </div>
      <div class="rounded-lg p-2.5 bg-yellow-400/20" style="border:1px solid rgba(250,204,21,0.3)">
        <div class="text-[10px] text-yellow-300 mb-1">Revenue</div>
        <div class="text-lg font-black text-yellow-300">$12.4k</div>
      </div>
    </div>
    <button class="w-full mt-2 text-xs py-1.5 px-3 rounded-lg bg-yellow-400 text-violet-900 font-bold">View report →</button>
  </div>
</body>`,
  },
  {
    id: "dark",
    label: "Dark & Modern",
    description: "Glassmorphism cards, dark background, glowing accents",
    html: `<script src="https://cdn.tailwindcss.com"></script>
<body class="m-0 p-4 overflow-hidden font-sans" style="background:#0a0a0f">
  <div class="rounded-xl p-4 space-y-2" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(12px)">
    <div class="flex items-center gap-2 mb-3">
      <div class="w-6 h-6 rounded-lg" style="background:linear-gradient(135deg,#7c3aed,#4f46e5)"></div>
      <span class="text-xs font-semibold tracking-wide uppercase" style="color:rgba(255,255,255,0.6)">Dashboard</span>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <div class="rounded-lg p-2.5" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)">
        <div class="text-[10px] mb-1" style="color:rgba(255,255,255,0.35)">Users</div>
        <div class="text-lg font-bold text-white">2,481</div>
      </div>
      <div class="rounded-lg p-2.5" style="background:rgba(124,58,237,0.15);border:1px solid rgba(124,58,237,0.2)">
        <div class="text-[10px] mb-1" style="color:rgba(167,139,250,0.7)">Revenue</div>
        <div class="text-lg font-bold" style="color:#a78bfa">$12.4k</div>
      </div>
    </div>
    <button class="w-full mt-2 text-xs py-1.5 px-3 rounded-lg font-medium text-white" style="background:linear-gradient(90deg,#7c3aed,#4f46e5)">View report</button>
  </div>
</body>`,
  },
];

export function DesignDirectionsPanel({ onSendToChat, initialPrompt = "" }: DesignDirectionsPanelProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [directions, setDirections] = useState<DesignDirection[]>(STATIC_FALLBACKS);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function generate() {
    const p = prompt.trim();
    if (!p) {
      toast({ title: "Enter a description first", variant: "destructive" });
      textareaRef.current?.focus();
      return;
    }
    setLoading(true);
    setError(null);
    setSelected(null);
    try {
      const res = await fetch("/api/ai/design-directions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });
      const data = await res.json() as { directions?: DesignDirection[]; error?: string };
      if (!res.ok || !data.directions) throw new Error(data.error ?? "Generation failed");
      setDirections(data.directions);
      setHasGenerated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (!selected) return;
    const dir = directions.find((d) => d.id === selected);
    if (!dir) return;
    const styleHint =
      dir.id === "minimal"
        ? "clean whitespace, subtle gray borders, light background, and a minimal aesthetic"
        : dir.id === "bold"
        ? "saturated accent colours (violet/yellow), bold typography, and high-energy layouts"
        : "dark background (#0a0a0f), glassmorphism cards with rgba borders, and violet/indigo gradient accents";
    const chatPrompt = `Apply the "${dir.label}" design direction across this project. Use ${styleHint}. ${dir.description}. Propagate this style to all components — nav, cards, buttons, forms, and typography.`;
    onSendToChat?.(chatPrompt);
    toast({ title: `"${dir.label}" direction applied`, description: "The AI will build using this visual style." });
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Palette className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-semibold">Design Directions</p>
            <p className="text-[11px] text-muted-foreground">AI renders 3 live previews — pick one before building</p>
          </div>
        </div>

        {/* Prompt input */}
        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void generate(); }}
            placeholder="Describe your app… e.g. SaaS dashboard for managing invoices and clients"
            className="w-full text-xs rounded-lg border border-border bg-muted/30 p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50 placeholder:text-muted-foreground/50 leading-relaxed"
            rows={2}
          />
          <button
            onClick={() => void generate()}
            disabled={loading || !prompt.trim()}
            className="w-full flex items-center justify-center gap-2 text-xs py-2 px-3 rounded-lg font-medium transition-all bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating real previews…</>
            ) : (
              <><Wand2 className="w-3.5 h-3.5" /> {hasGenerated ? "Regenerate directions" : "Generate 3 directions"}</>
            )}
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Live iframe previews */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!hasGenerated && (
          <p className="text-[11px] text-muted-foreground/50 text-center py-1">
            <Sparkles className="w-3 h-3 inline mr-1" />
            Examples below — enter a description to get AI-rendered previews for your app
          </p>
        )}

        {directions.map((dir) => {
          const isSelected = selected === dir.id;
          return (
            <div
              key={dir.id}
              onClick={() => setSelected(isSelected ? null : dir.id)}
              className={`group relative rounded-xl border-2 cursor-pointer transition-all overflow-hidden ${
                isSelected
                  ? "border-violet-500 shadow-sm shadow-violet-500/20"
                  : "border-border hover:border-violet-500/40"
              }`}
            >
              {/* Live iframe */}
              <div className="relative overflow-hidden" style={{ height: 200 }}>
                <iframe
                  srcDoc={dir.html}
                  className="absolute inset-0 w-full h-full"
                  style={{ border: "none", pointerEvents: "none" }}
                  sandbox="allow-scripts"
                  title={dir.label}
                  loading="lazy"
                />
                {isSelected && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-violet-500 flex items-center justify-center shadow">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>

              {/* Label row */}
              <div className="px-3 py-2 bg-background border-t border-border flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">{dir.label}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{dir.description}</p>
                </div>
                {isSelected && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/20 shrink-0">
                    Selected
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Apply footer */}
      <div className="shrink-0 border-t border-border p-3 space-y-2">
        {!hasGenerated && (
          <p className="text-[11px] text-muted-foreground/50 text-center">
            Generate AI previews specific to your app before selecting
          </p>
        )}
        <button
          onClick={apply}
          disabled={!selected || !onSendToChat}
          className="w-full flex items-center justify-center gap-2 text-xs py-2 px-3 rounded-lg font-medium transition-all bg-foreground text-background hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowRight className="w-3.5 h-3.5" />
          Apply selected direction to project
        </button>
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <RefreshCw className="w-3 h-3 inline mr-1" />
            Clear selection
          </button>
        )}
      </div>
    </div>
  );
}
