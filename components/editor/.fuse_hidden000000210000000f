"use client";

import { useState } from "react";
import { Sparkles, Copy, Check, Loader2, RefreshCw, FileCode2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";
import { BALANCED_CODING_MODEL } from "@/lib/ai/model-defaults";

interface CopyGenPanelProps {
  projectId: string;
  files: ProjectFile[];
  onInsertCopy: (prompt: string) => void;
}

interface CopySection {
  key: string;
  label: string;
  emoji: string;
  content: string;
}

const EMPTY_SECTIONS: CopySection[] = [
  { key: "hero_headline",    label: "Hero Headline",      emoji: "🎯", content: "" },
  { key: "hero_subheadline", label: "Hero Subheadline",   emoji: "📝", content: "" },
  { key: "cta_primary",      label: "Primary CTA",        emoji: "🚀", content: "" },
  { key: "feature_1",        label: "Feature 1",          emoji: "⚡", content: "" },
  { key: "feature_2",        label: "Feature 2",          emoji: "🔒", content: "" },
  { key: "feature_3",        label: "Feature 3",          emoji: "🎨", content: "" },
  { key: "social_proof",     label: "Social Proof Line",  emoji: "⭐", content: "" },
  { key: "pricing_headline", label: "Pricing Headline",   emoji: "💰", content: "" },
  { key: "faq_1",            label: "FAQ #1",             emoji: "❓", content: "" },
  { key: "faq_2",            label: "FAQ #2",             emoji: "❓", content: "" },
  { key: "footer_tagline",   label: "Footer Tagline",     emoji: "✨", content: "" },
];

// ─── Parse app description from project files ─────────────────────────────────

function extractProjectContext(files: ProjectFile[]): string {
  const relevant = files
    .filter((f) => ["README.md", "package.json", "index.html", "App.tsx", "app/page.tsx", "pages/index.tsx"].some((n) => f.path.endsWith(n)))
    .slice(0, 3);

  const snippets = relevant.map((f) => `// ${f.path}\n${(f.content ?? "").slice(0, 400)}`).join("\n\n");
  return snippets || "A modern web application";
}

// ─── Stream copy from the AI chat API ────────────────────────────────────────

async function generateCopy(
  appDescription: string,
  projectContext: string,
  onSections: (sections: CopySection[]) => void,
  onDone: () => void,
  signal: AbortSignal
) {
  const systemPrompt = `You are a world-class SaaS copywriter. Generate concise, compelling marketing copy for a web app.

Return ONLY valid JSON — an object with these exact keys:
hero_headline, hero_subheadline, cta_primary, feature_1, feature_2, feature_3, social_proof, pricing_headline, faq_1, faq_2, footer_tagline.

Each value is a short string (no markdown, no quotes within the value). Keep it punchy and benefit-driven.`;

  const userMsg = `App description: ${appDescription}\n\nProject context:\n${projectContext}`;

  try {
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: userMsg }],
        model: BALANCED_CODING_MODEL,
        system: systemPrompt,
        mode: "chat",
        projectId: "copy-gen",
        response_format: { type: "json_object" },
      }),
      signal,
    });

    if (!res.ok || !res.body) throw new Error("AI request failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") break;
        try {
          const parsed = JSON.parse(data) as { content?: string };
          if (parsed.content) accumulated += parsed.content;
        } catch { /* skip malformed */ }
      }
    }

    // Parse accumulated JSON
    const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;

    const sections: CopySection[] = EMPTY_SECTIONS.map((s) => ({
      ...s,
      content: parsed[s.key] ?? "",
    }));
    onSections(sections);
  } finally {
    onDone();
  }
}

// ─── Copy section card ────────────────────────────────────────────────────────

function SectionCard({
  section,
  onChange,
  onInsert,
}: {
  section: CopySection;
  onChange: (content: string) => void;
  onInsert: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  function copy() {
    navigator.clipboard.writeText(section.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{section.emoji}</span>
          <span className="text-xs font-medium text-foreground">{section.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {section.content && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
              {section.content.slice(0, 30)}{section.content.length > 30 ? "…" : ""}
            </span>
          )}
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border">
          <Textarea
            value={section.content}
            onChange={(e) => onChange(e.target.value)}
            rows={section.key.includes("faq") || section.key === "hero_subheadline" ? 3 : 2}
            className="mt-2 text-xs bg-muted/30 border-border resize-none"
            placeholder={`${section.label}…`}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1" onClick={copy}>
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 h-7 text-[11px] gap-1" onClick={onInsert}>
              <FileCode2 className="w-3 h-3" /> Insert
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CopyGenPanel({ projectId, files, onInsertCopy }: CopyGenPanelProps) {
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState<CopySection[]>(EMPTY_SECTIONS);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);

  const projectContext = extractProjectContext(files);

  async function generate() {
    if (generating) { abortCtrl?.abort(); return; }
    const ctrl = new AbortController();
    setAbortCtrl(ctrl);
    setGenerating(true);
    setGenerated(false);
    setSections(EMPTY_SECTIONS);

    try {
      await generateCopy(
        description || "A modern SaaS web application",
        projectContext,
        (s) => { setSections(s); setGenerated(true); },
        () => { setGenerating(false); },
        ctrl.signal
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        toast({ title: "Generation failed", description: "Could not reach AI. Try again.", variant: "destructive" });
      }
      setGenerating(false);
    }
  }

  function insertAll() {
    const copyText = sections
      .filter((s) => s.content)
      .map((s) => `### ${s.label}\n${s.content}`)
      .join("\n\n");
    onInsertCopy(`Update my landing page with this marketing copy:\n\n${copyText}`);
  }

  function updateSection(key: string, content: string) {
    setSections((prev) => prev.map((s) => s.key === key ? { ...s, content } : s));
  }

  function insertSection(section: CopySection) {
    onInsertCopy(`Update my landing page to use this copy for the ${section.label}: "${section.content}"`);
  }

  const filledCount = sections.filter((s) => s.content).length;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-foreground">Copy Generator</h2>
          {generated && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-500/30 text-emerald-400">
              {filledCount}/{sections.length} sections
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">AI-generated marketing copy for your landing page</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">App description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. A project management tool for remote design teams that auto-generates weekly status reports…"
            rows={3}
            className="text-xs bg-muted/30 border-border resize-none"
          />
          <p className="text-[11px] text-muted-foreground">Leave blank to use project files as context</p>
        </div>

        {/* Sections */}
        {generated && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Generated copy</label>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] gap-1 text-violet-400 hover:text-violet-300"
                onClick={insertAll}
              >
                <FileCode2 className="w-3 h-3" /> Insert all
              </Button>
            </div>
            {sections.map((section) => (
              <SectionCard
                key={section.key}
                section={section}
                onChange={(content) => updateSection(section.key, content)}
                onInsert={() => insertSection(section)}
              />
            ))}
          </div>
        )}

        {!generated && !generating && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-violet-400" />
            </div>
            <p className="text-sm font-medium text-foreground">Generate landing page copy</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Add a description above (optional) then click Generate to create hero, features, FAQ, and more.
            </p>
          </div>
        )}

        {generating && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <p className="text-xs text-muted-foreground">Writing your copy…</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border flex gap-2">
        {generated && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={generate} disabled={generating}>
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate
          </Button>
        )}
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={generate}
          disabled={false}
        >
          {generating ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Stop</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" /> {generated ? "Regenerate" : "Generate"}</>
          )}
        </Button>
      </div>
    </div>
  );
}
