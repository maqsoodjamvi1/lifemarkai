"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ArrowRight, Loader2, Code2, Zap, Box, Wind,
  Wand2, RefreshCw, ChevronDown, Plus, Paperclip, Palette,
  Link2, Database, Mic, Map,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type CreateMode = "build" | "plan";

interface PromptCreateBoxProps {
  variant?: "default" | "hero";
}

const FRAMEWORKS = [
  { id: "react",  label: "React",    icon: Code2, color: "text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/10" },
  { id: "next",   label: "Next.js",  icon: Zap,   color: "text-slate-300 border-slate-500/30 hover:bg-slate-500/10" },
  { id: "vue",    label: "Vue 3",    icon: Box,   color: "text-green-400 border-green-500/30 hover:bg-green-500/10" },
  { id: "svelte", label: "SvelteKit",icon: Wind,  color: "text-orange-400 border-orange-500/30 hover:bg-orange-500/10" },
] as const;

type Framework = "react" | "next" | "vue" | "svelte";

const SUGGESTIONS = [
  "SaaS dashboard with analytics and user management",
  "E-commerce store with cart and Stripe checkout",
  "Real-time chat app with rooms and online presence",
  "Kanban board with drag-and-drop columns",
  "Personal finance tracker with charts and budgets",
];

interface AppConcept {
  name: string;
  emoji: string;
  pitch: string;
  stack: string;
  accent: string;
  prompt: string;
}

const CONCEPT_ACCENTS = [
  { bg: "bg-violet-500/10", border: "border-violet-500/30", text: "text-violet-400", ring: "ring-violet-500/40" },
  { bg: "bg-blue-500/10",   border: "border-blue-500/30",   text: "text-blue-400",   ring: "ring-blue-500/40"   },
  { bg: "bg-emerald-500/10",border: "border-emerald-500/30",text: "text-emerald-400",ring: "ring-emerald-500/40"},
];

export function PromptCreateBox({ variant = "default" }: PromptCreateBoxProps) {
  const [prompt, setPrompt] = useState("");
  const [framework, setFramework] = useState<Framework>("react");
  const [createMode, setCreateMode] = useState<CreateMode>("build");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isHero = variant === "hero";
  const [brainstorming, setBrainstorming] = useState(false);
  const [concepts, setConcepts] = useState<AppConcept[]>([]);
  const [buildingConceptIdx, setBuildingConceptIdx] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function handleCreate(overridePrompt?: string, overrideName?: string) {
    const trimmed = (overridePrompt ?? prompt).trim();
    if (!trimmed || loading) return;

    setLoading(true);
    try {
      const name = (overrideName ?? trimmed).slice(0, 50) + ((overrideName ?? trimmed).length > 50 ? "…" : "");
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: trimmed, framework }),
      });
      if (!res.ok) throw new Error(await res.text());
      const project = await res.json();
      const modeParam = createMode === "plan" ? "&mode=plan" : "";
      router.push(`/editor/${project.id}?prompt=${encodeURIComponent(trimmed)}${modeParam}`);
    } catch (err: unknown) {
      toast({
        title: "Failed to create project",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setLoading(false);
    }
  }

  async function handleBuildConcept(concept: AppConcept, idx: number) {
    setBuildingConceptIdx(idx);
    setLoading(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: concept.name, description: concept.prompt, framework }),
      });
      if (!res.ok) throw new Error(await res.text());
      const project = await res.json();
      const modeParam = createMode === "plan" ? "&mode=plan" : "";
      router.push(`/editor/${project.id}?prompt=${encodeURIComponent(concept.prompt)}${modeParam}`);
    } catch (err: unknown) {
      toast({
        title: "Failed to create project",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setLoading(false);
      setBuildingConceptIdx(null);
    }
  }

  async function handleBrainstorm() {
    const trimmed = prompt.trim();
    if (!trimmed || brainstorming) return;

    setBrainstorming(true);
    setConcepts([]);

    try {
      const res = await fetch("/api/ai/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: trimmed }),
      });

      if (!res.ok) throw new Error("AI request failed");

      // Collect streamed SSE text
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.content) fullText += parsed.content;
            } catch (e) {
              // SSE frames can arrive split mid-JSON; partial-token errors are
              // expected and recoverable on the next chunk. Only re-throw when
              // the error is a real server-side problem (parsed.error path
              // above re-throws explicitly).
              const msg = (e as Error).message || "";
              const isPartialParse =
                msg.startsWith("Unexpected token") ||
                msg.startsWith("Unexpected end of JSON input") ||
                msg.includes("Expected property name") ||
                msg.includes("position");
              if (!isPartialParse) throw e;
            }
          }
        }
      }

      // Extract JSON array
      const match = fullText.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as AppConcept[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setConcepts(parsed.slice(0, 3));
        } else {
          throw new Error("Invalid concept format");
        }
      } else {
        throw new Error("No JSON found in response");
      }
    } catch {
      toast({
        title: "Brainstorm failed",
        description: "Couldn't generate concepts. Try a more specific idea.",
        variant: "destructive",
      });
    } finally {
      setBrainstorming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleCreate();
    }
  }

  const cardClass = isHero
    ? "relative rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur-sm overflow-hidden text-left"
    : "relative rounded-2xl border border-border bg-card shadow-lg overflow-hidden";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full"
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*,.pdf,.txt,.md,.json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            toast({
              title: "Attachment noted",
              description: `"${file.name}" — attach files in the editor after your project opens.`,
            });
          }
          e.target.value = "";
        }}
      />

      {/* Main prompt card */}
      <div className={cardClass}>
        {!isHero && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-violet-500 via-blue-500 to-violet-500 opacity-60" />
        )}

        <div className="p-4 pt-5">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isHero
                ? "Describe what you want to build…"
                : "What do you want to build? e.g. 'A SaaS dashboard with dark mode, user auth, and billing...'"
            }
            className={`w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-muted-foreground min-h-[72px] max-h-40 ${
              isHero ? "text-slate-800" : ""
            }`}
            disabled={loading}
          />

          <div className={`flex items-center justify-between gap-3 mt-3 pt-3 ${isHero ? "border-t border-slate-200/80" : "border-t border-border/50"}`}>
            <div className="flex items-center gap-1.5 flex-wrap">
              {isHero ? (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
                        title="Add context"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                        <Paperclip className="w-4 h-4 mr-2" /> Attach
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/templates"><Palette className="w-4 h-4 mr-2" /> Design</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/connectors"><Link2 className="w-4 h-4 mr-2" /> Connectors</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/dashboard/settings?tab=cloud"><Database className="w-4 h-4 mr-2" /> Databases</Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1 h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {FRAMEWORKS.find((f) => f.id === framework)?.label}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {FRAMEWORKS.map((fw) => {
                        const Icon = fw.icon;
                        return (
                          <DropdownMenuItem key={fw.id} onClick={() => setFramework(fw.id)}>
                            <Icon className="w-4 h-4 mr-2" /> {fw.label}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                FRAMEWORKS.map((fw) => {
                  const Icon = fw.icon;
                  const active = framework === fw.id;
                  return (
                    <button
                      key={fw.id}
                      onClick={() => setFramework(fw.id)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${fw.color} ${
                        active
                          ? "border-opacity-100 bg-opacity-20 ring-1 ring-current ring-opacity-30"
                          : "border-transparent"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {fw.label}
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {isHero && (
                <button
                  type="button"
                  onClick={() =>
                    toast({
                      title: "Voice input",
                      description: "Open your project in the editor and use the mic button in chat.",
                    })
                  }
                  className="flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                  title="Voice input (in editor)"
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}

              {!isHero && (
                <button
                  onClick={handleBrainstorm}
                  disabled={!prompt.trim() || brainstorming || loading}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Generate 3 app concepts from your idea"
                >
                  {brainstorming ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Thinking…</>
                  ) : (
                    <><Wand2 className="w-3 h-3" /> Get ideas</>
                  )}
                </button>
              )}

              {isHero ? (
                <div className="flex items-center rounded-lg overflow-hidden border border-slate-900/10">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1 h-8 px-2.5 text-xs font-medium bg-slate-900/5 border-r border-slate-200"
                      >
                        {createMode === "plan" ? (
                          <><Map className="w-3 h-3" /> Plan</>
                        ) : (
                          <><Sparkles className="w-3 h-3" /> Build</>
                        )}
                        <ChevronDown className="w-3 h-3 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setCreateMode("build")}>
                        <Sparkles className="w-4 h-4 mr-2" /> Build — generate code
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setCreateMode("plan")}>
                        <Map className="w-4 h-4 mr-2" /> Plan — architecture first
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    onClick={() => void handleCreate()}
                    disabled={!prompt.trim() || loading}
                    className="h-8 px-4 gap-1 rounded-none text-xs bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {loading && buildingConceptIdx === null ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => void handleCreate()}
                  disabled={!prompt.trim() || loading}
                  className="h-8 px-4 gap-1.5 text-xs bg-gradient-brand text-white hover:opacity-90"
                >
                  {loading && buildingConceptIdx === null ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Building…</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" /> Build it <ArrowRight className="w-3 h-3" /></>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Suggestion chips */}
      {concepts.length === 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-xs text-muted-foreground self-center">Try:</span>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setPrompt(s);
                textareaRef.current?.focus();
              }}
              className="text-xs px-3 py-1 rounded-full bg-muted hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {s.split(" ").slice(0, 3).join(" ")}…
            </button>
          ))}
        </div>
      )}

      {/* ── AI-generated concept cards ── */}
      <AnimatePresence>
        {(brainstorming || concepts.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.3 }}
            className="mt-4"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wand2 className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-foreground">
                  {brainstorming ? "Generating ideas…" : `3 concepts for "${prompt.slice(0, 30)}${prompt.length > 30 ? "…" : ""}"`}
                </span>
              </div>
              {concepts.length > 0 && (
                <button
                  onClick={handleBrainstorm}
                  disabled={brainstorming}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              )}
            </div>

            {/* Loading skeleton */}
            {brainstorming && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-xl border border-border bg-muted/30 p-4 animate-pulse">
                    <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                    <div className="h-3 bg-muted rounded w-full mb-1" />
                    <div className="h-3 bg-muted rounded w-4/5 mb-3" />
                    <div className="h-3 bg-muted rounded w-1/2 mb-4" />
                    <div className="h-7 bg-muted rounded w-full" />
                  </div>
                ))}
              </div>
            )}

            {/* Concept cards */}
            {!brainstorming && concepts.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {concepts.map((concept, idx) => {
                  const accent = CONCEPT_ACCENTS[idx % CONCEPT_ACCENTS.length];
                  const isBuilding = buildingConceptIdx === idx && loading;
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.08 }}
                      className={`group relative rounded-xl border ${accent.border} ${accent.bg} p-4 flex flex-col gap-2 hover:ring-1 ${accent.ring} transition-all`}
                    >
                      {/* Emoji + name */}
                      <div className="flex items-center gap-2">
                        <span className="text-xl leading-none">{concept.emoji}</span>
                        <span className={`text-sm font-semibold ${accent.text}`}>{concept.name}</span>
                      </div>

                      {/* Pitch */}
                      <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                        {concept.pitch}
                      </p>

                      {/* Stack badge */}
                      <div className="flex items-center gap-1">
                        <Code2 className="w-2.5 h-2.5 text-muted-foreground/60" />
                        <span className="text-[10px] text-muted-foreground/70 font-mono">{concept.stack}</span>
                      </div>

                      {/* Build this button */}
                      <button
                        onClick={() => void handleBuildConcept(concept, idx)}
                        disabled={loading}
                        className={`mt-1 flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-xs font-medium border ${accent.border} ${accent.text} hover:${accent.bg} transition-colors disabled:opacity-50`}
                      >
                        {isBuilding ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Building…</>
                        ) : (
                          <><Sparkles className="w-3 h-3" /> Build this</>
                        )}
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
