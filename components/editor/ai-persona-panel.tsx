"use client";

import { useState, useEffect } from "react";
import { Bot, Save, Loader2, RefreshCw, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface AiPersonaPanelProps {
  projectId: string;
}

interface Persona {
  name: string;
  role: string;
  tone: string;
  expertise: string[];
  codeStyle: string;
  preferredLibraries: string;
  avoidPatterns: string;
  customInstructions: string;
  active: boolean;
}

const DEFAULT_PERSONA: Persona = {
  name: "",
  role: "Senior Full-Stack Developer",
  tone: "professional",
  expertise: ["React", "TypeScript", "Supabase"],
  codeStyle: "functional",
  preferredLibraries: "shadcn/ui, Tailwind CSS, Zod, React Hook Form",
  avoidPatterns: "class components, any type, console.log in production",
  customInstructions: "",
  active: false,
};

const TONE_OPTIONS = ["professional", "concise", "friendly", "verbose", "Socratic"];
const ROLE_OPTIONS = [
  "Senior Full-Stack Developer",
  "Frontend Specialist",
  "Backend Engineer",
  "DevOps Engineer",
  "UI/UX-focused Developer",
  "Security Engineer",
  "Performance Engineer",
];
const CODE_STYLE_OPTIONS = ["functional", "object-oriented", "declarative", "minimal", "verbose-with-comments"];

const PRESET_PERSONAS: { label: string; persona: Partial<Persona> }[] = [
  {
    label: "Next.js Expert",
    persona: {
      name: "Nex", role: "Senior Full-Stack Developer", tone: "professional",
      expertise: ["Next.js", "React", "TypeScript", "Tailwind CSS"],
      preferredLibraries: "shadcn/ui, Prisma, tRPC, Zod",
      avoidPatterns: "pages router, useEffect for data fetching (use server components), inline styles",
    },
  },
  {
    label: "Supabase Architect",
    persona: {
      name: "Supa", role: "Backend Engineer", tone: "concise",
      expertise: ["Supabase", "PostgreSQL", "Row Level Security", "Edge Functions"],
      preferredLibraries: "Supabase JS, pg, Drizzle ORM",
      avoidPatterns: "missing RLS policies, unindexed foreign keys, SELECT * in production",
    },
  },
  {
    label: "UI Perfectionist",
    persona: {
      name: "Pixel", role: "UI/UX-focused Developer", tone: "friendly",
      expertise: ["React", "Tailwind CSS", "Framer Motion", "Accessibility"],
      preferredLibraries: "shadcn/ui, Radix UI, Framer Motion, Lucide Icons",
      avoidPatterns: "fixed pixel values, missing ARIA labels, non-responsive layouts",
    },
  },
];

export function AiPersonaPanel({ projectId }: AiPersonaPanelProps) {
  const [persona, setPersona] = useState<Persona>(DEFAULT_PERSONA);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expertiseInput, setExpertiseInput] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/persona`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.persona) setPersona({ ...DEFAULT_PERSONA, ...data.persona });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId]);

  async function savePersona() {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}/persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ persona }),
      });
      toast({ title: persona.active ? "Persona activated" : "Persona saved" });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function applyPreset(preset: Partial<Persona>) {
    setPersona((p) => ({ ...p, ...preset, active: p.active }));
    toast({ title: "Preset applied" });
  }

  function addExpertise() {
    if (!expertiseInput.trim()) return;
    setPersona((p) => ({ ...p, expertise: [...p.expertise, expertiseInput.trim()] }));
    setExpertiseInput("");
  }

  function removeExpertise(item: string) {
    setPersona((p) => ({ ...p, expertise: p.expertise.filter((e) => e !== item) }));
  }

  function buildSystemPromptPreview(p: Persona): string {
    const lines = [
      `You are ${p.name || "an AI assistant"}, a ${p.role}.`,
      `Tone: ${p.tone}.`,
      p.expertise.length > 0 && `Your core expertise: ${p.expertise.join(", ")}.`,
      p.codeStyle && `Code style preference: ${p.codeStyle}.`,
      p.preferredLibraries && `Preferred libraries: ${p.preferredLibraries}.`,
      p.avoidPatterns && `Always avoid: ${p.avoidPatterns}.`,
      p.customInstructions && p.customInstructions,
    ].filter(Boolean);
    return lines.join("\n");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-rose-400" />
          <h2 className="font-semibold text-foreground">AI Persona</h2>
          <Badge
            variant="outline"
            className={`text-[10px] h-4 px-1.5 cursor-pointer ${persona.active ? "border-emerald-500/40 text-emerald-400" : "border-border text-muted-foreground"}`}
            onClick={() => setPersona((p) => ({ ...p, active: !p.active }))}
          >
            {persona.active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Define a custom AI persona injected into all chat prompts</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Presets */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Quick Presets</p>
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_PERSONAS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.persona)}
                className="text-[10px] px-2 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors"
              >
                <Sparkles className="w-2.5 h-2.5 inline mr-0.5" />{p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Persona Name</label>
          <Input
            value={persona.name}
            onChange={(e) => setPersona((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Alex, Nex, Aria…"
            className="h-8 text-xs bg-muted/20 border-border"
          />
        </div>

        {/* Role */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Role</label>
          <select
            value={persona.role}
            onChange={(e) => setPersona((p) => ({ ...p, role: e.target.value }))}
            className="w-full h-8 text-xs bg-muted/20 border border-border rounded-md px-2 text-foreground focus:outline-none"
          >
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {/* Tone */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Tone</label>
          <div className="flex gap-1.5 flex-wrap">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t}
                onClick={() => setPersona((p) => ({ ...p, tone: t }))}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all capitalize ${
                  persona.tone === t
                    ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                    : "border-border text-muted-foreground hover:border-muted-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Expertise */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Expertise Tags</label>
          <div className="flex gap-1 flex-wrap min-h-6">
            {persona.expertise.map((e) => (
              <button
                key={e}
                onClick={() => removeExpertise(e)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-muted/30 border border-border text-foreground hover:border-red-500/40 hover:text-red-400 transition-colors"
              >
                {e} ×
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={expertiseInput}
              onChange={(e) => setExpertiseInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addExpertise(); }}
              placeholder="Add technology…"
              className="h-7 text-xs bg-muted/20 border-border flex-1"
            />
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addExpertise}>Add</Button>
          </div>
        </div>

        {/* Code style */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Code Style</label>
          <select
            value={persona.codeStyle}
            onChange={(e) => setPersona((p) => ({ ...p, codeStyle: e.target.value }))}
            className="w-full h-8 text-xs bg-muted/20 border border-border rounded-md px-2 text-foreground focus:outline-none"
          >
            {CODE_STYLE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Preferred libraries */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Preferred Libraries</label>
          <textarea
            value={persona.preferredLibraries}
            onChange={(e) => setPersona((p) => ({ ...p, preferredLibraries: e.target.value }))}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            placeholder="shadcn/ui, Tailwind, Zod…"
          />
        </div>

        {/* Avoid patterns */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Always Avoid</label>
          <textarea
            value={persona.avoidPatterns}
            onChange={(e) => setPersona((p) => ({ ...p, avoidPatterns: e.target.value }))}
            rows={2}
            className="w-full resize-none rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            placeholder="class components, any type…"
          />
        </div>

        {/* Custom instructions */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Custom Instructions</label>
          <textarea
            value={persona.customInstructions}
            onChange={(e) => setPersona((p) => ({ ...p, customInstructions: e.target.value }))}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-muted/20 px-2.5 py-1.5 text-xs text-foreground focus:outline-none"
            placeholder="Always add JSDoc comments. Prefer named exports. Use error boundaries…"
          />
        </div>

        {/* Preview */}
        <div className="rounded-xl border border-border overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
            onClick={() => setPreviewOpen((v) => !v)}
          >
            System prompt preview
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${previewOpen ? "rotate-180" : ""}`} />
          </button>
          {previewOpen && (
            <pre className="p-3 text-[10px] font-mono text-muted-foreground bg-muted/10 whitespace-pre-wrap border-t border-border">
              {buildSystemPromptPreview(persona)}
            </pre>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className={`w-1.5 h-1.5 rounded-full ${persona.active ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
          {persona.active ? "Persona will be injected into all AI prompts for this project" : "Persona is inactive — click badge to activate"}
        </div>
        <Button size="sm" className="w-full gap-1.5" onClick={savePersona} disabled={saving}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save Persona"}
        </Button>
      </div>
    </div>
  );
}
