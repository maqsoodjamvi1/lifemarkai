"use client";

import { useState } from "react";
import { ImageIcon, Loader2, RefreshCw, Download, Check, Sparkles, FileImage, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface IconGenPanelProps {
  projectId: string;
  files: ProjectFile[];
}

type GenerationMode = "icon" | "og";

interface GeneratedAsset {
  mode: GenerationMode;
  url: string;
  prompt: string;
  revisedPrompt?: string;
}

const ICON_STYLES = [
  { id: "flat",    label: "Flat",       desc: "Clean flat design, minimal shadows" },
  { id: "glass",   label: "Glass",      desc: "Glassmorphism, translucent layers" },
  { id: "3d",      label: "3D",         desc: "Soft 3D rendered icon" },
  { id: "neon",    label: "Neon",       desc: "Dark background, glowing neon lines" },
  { id: "pixel",   label: "Pixel",      desc: "Retro 16-bit pixel art style" },
  { id: "minimal", label: "Minimal",    desc: "Ultra-minimal, single color" },
];

const OG_LAYOUTS = [
  { id: "centered",  label: "Centered",  desc: "App name + tagline centered on gradient" },
  { id: "split",     label: "Split",     desc: "Left text, right product screenshot area" },
  { id: "dark",      label: "Dark hero", desc: "Dark background with glowing headline" },
];

function extractAppName(files: ProjectFile[]): string {
  const pkg = files.find((f) => f.path.endsWith("package.json"));
  if (pkg?.content) {
    const m = pkg.content.match(/"name"\s*:\s*"([^"]+)"/);
    if (m) return m[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "My App";
}

async function generateImage(
  prompt: string,
  size: "1024x1024" | "1792x1024",
  projectId: string
): Promise<{ url: string; revised_prompt?: string }> {
  const res = await fetch("/api/ai/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, size, projectId, quality: "standard" }),
  });
  if (!res.ok) throw new Error("Image generation failed");
  const data = await res.json() as { url?: string; imageUrl?: string; revised_prompt?: string };
  return { url: data.url ?? data.imageUrl ?? "", revised_prompt: data.revised_prompt };
}

async function saveToProjectFiles(projectId: string, filename: string, imageUrl: string): Promise<void> {
  // Download image as blob and save as base64 data URL
  const imgRes = await fetch(imageUrl);
  const blob = await imgRes.blob();
  const reader = new FileReader();
  const dataUrl: string = await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  await fetch(`/api/projects/${projectId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: `public/${filename}`, content: dataUrl, language: "binary" }),
  });
}

export function IconGenPanel({ projectId, files }: IconGenPanelProps) {
  const appName = extractAppName(files);

  const [mode, setMode] = useState<GenerationMode>("icon");
  const [iconStyle, setIconStyle] = useState("flat");
  const [ogLayout, setOgLayout] = useState("centered");
  const [customPrompt, setCustomPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [asset, setAsset] = useState<GeneratedAsset | null>(null);

  function buildIconPrompt(): string {
    const style = ICON_STYLES.find((s) => s.id === iconStyle);
    const base = `A beautiful app icon for "${appName}", ${style?.desc ?? "flat design"}, square format with rounded corners, professional quality, app store ready`;
    return customPrompt ? `${base}. Additional style: ${customPrompt}` : base;
  }

  function buildOGPrompt(): string {
    const layout = OG_LAYOUTS.find((l) => l.id === ogLayout);
    const base = `A professional Open Graph social card image for "${appName}", ${layout?.desc ?? "centered layout"}, 1200x630 aspect ratio, modern SaaS marketing style, high contrast text, bold typography`;
    return customPrompt ? `${base}. Theme: ${customPrompt}` : base;
  }

  async function generate() {
    setGenerating(true);
    setAsset(null);
    try {
      const prompt = mode === "icon" ? buildIconPrompt() : buildOGPrompt();
      const size   = mode === "icon" ? "1024x1024" : "1792x1024";
      const { url, revised_prompt } = await generateImage(prompt, size, projectId);
      setAsset({ mode, url, prompt, revisedPrompt: revised_prompt });
    } catch {
      toast({ title: "Generation failed", description: "Could not generate image. Check that OPENAI_API_KEY is set.", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function saveToProject() {
    if (!asset) return;
    setSaving(true);
    try {
      const filename = asset.mode === "icon" ? "icon.png" : "og.png";
      await saveToProjectFiles(projectId, filename, asset.url);
      toast({ title: `Saved to public/${filename}`, description: "File added to your project files." });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function downloadAsset() {
    if (!asset) return;
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = asset.mode === "icon" ? "icon.png" : "og.png";
    a.click();
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <ImageIcon className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-foreground">Icon &amp; OG Generator</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-500/30 text-violet-400">DALL·E 3</Badge>
        </div>
        <p className="text-xs text-muted-foreground">AI-generated app icon and social preview image</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: "icon", label: "App Icon",     emoji: "🎨", size: "512×512",   note: "Favicon, App Store" },
            { id: "og",   label: "Social Card",  emoji: "📸", size: "1200×630",  note: "Twitter, LinkedIn" },
          ] as const).map(({ id, label, emoji, size, note }) => (
            <button
              key={id}
              onClick={() => { setMode(id); setAsset(null); }}
              className={`rounded-xl border p-3 text-left transition-all ${
                mode === id ? "border-violet-500/50 bg-violet-500/10" : "border-border bg-muted/20 hover:bg-muted/30"
              }`}
            >
              <div className="text-xl mb-1">{emoji}</div>
              <p className="text-xs font-medium text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground">{size} · {note}</p>
            </button>
          ))}
        </div>

        {/* Style selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {mode === "icon" ? "Icon style" : "Layout"}
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {(mode === "icon" ? ICON_STYLES : OG_LAYOUTS).map((style) => (
              <button
                key={style.id}
                onClick={() => mode === "icon" ? setIconStyle(style.id) : setOgLayout(style.id)}
                className={`rounded-lg border p-2 text-left transition-all ${
                  (mode === "icon" ? iconStyle : ogLayout) === style.id
                    ? "border-violet-500/50 bg-violet-500/10"
                    : "border-border bg-muted/20 hover:bg-muted/30"
                }`}
              >
                <p className="text-xs font-medium text-foreground">{style.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{style.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Custom prompt */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Additional instructions (optional)</label>
          <Input
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={mode === "icon" ? "e.g. purple gradient, lightning bolt symbol…" : "e.g. dark navy background, tech aesthetic…"}
            className="h-9 text-xs bg-muted/30 border-border"
          />
        </div>

        {/* App name context */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <Zap className="w-3.5 h-3.5 text-violet-400" />
          Generating for: <span className="text-foreground font-medium">{appName}</span>
        </div>

        {/* Generated image */}
        {generating && (
          <div className="flex flex-col items-center gap-3 py-8 rounded-xl border border-border bg-muted/10">
            <Loader2 className="w-7 h-7 animate-spin text-violet-400" />
            <p className="text-xs text-muted-foreground">Generating {mode === "icon" ? "icon" : "social card"}…</p>
            <p className="text-[10px] text-muted-foreground/60">This takes ~15–20 seconds</p>
          </div>
        )}

        {asset && !generating && (
          <div className="space-y-3">
            <div className={`rounded-xl border border-border overflow-hidden ${asset.mode === "icon" ? "max-w-[160px] mx-auto" : "w-full"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.url}
                alt={asset.mode === "icon" ? "App icon" : "OG social card"}
                className="w-full h-auto"
              />
            </div>

            {asset.revisedPrompt && (
              <p className="text-[10px] text-muted-foreground italic px-1 leading-relaxed">
                "{asset.revisedPrompt.slice(0, 120)}…"
              </p>
            )}

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs gap-1.5" onClick={downloadAsset}>
                <Download className="w-3.5 h-3.5" /> Download
              </Button>
              <Button
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5"
                onClick={saveToProject}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileImage className="w-3.5 h-3.5" />}
                {saving ? "Saving…" : "Save to project"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Saves as <code className="font-mono">public/{asset.mode === "icon" ? "icon.png" : "og.png"}</code>
            </p>
          </div>
        )}

        {!asset && !generating && (
          <div className="flex flex-col items-center gap-3 py-6 text-center rounded-xl border border-dashed border-border">
            <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              Click Generate to create your {mode === "icon" ? "512×512 app icon" : "1200×630 social card"}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border flex gap-2">
        {asset && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setAsset(null); generate(); }} disabled={generating}>
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </Button>
        )}
        <Button size="sm" className="flex-1 gap-1.5" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {generating ? "Generating…" : "Generate"}
        </Button>
      </div>
    </div>
  );
}
