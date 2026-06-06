"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image, Download, Copy, Loader2, Sparkles, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  size: string;
  style: string;
  createdAt: string;
}

const IMAGE_SIZES = ["1024x1024", "1792x1024", "1024x1792"] as const;
const IMAGE_STYLES = ["vivid", "natural"] as const;

interface ImageGenPanelProps {
  projectId?: string;
  onInsertImage?: (url: string) => void;
}

export function ImageGenPanel({ projectId, onInsertImage }: ImageGenPanelProps = {}) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState<typeof IMAGE_SIZES[number]>("1024x1024");
  const [style, setStyle] = useState<typeof IMAGE_STYLES[number]>("vivid");
  const [transparent, setTransparent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [selected, setSelected] = useState<GeneratedImage | null>(null);
  const { toast } = useToast();

  const QUICK_PROMPTS = [
    "App icon for a productivity app, minimalist, gradient purple to blue",
    "Hero image for a SaaS landing page, abstract tech background",
    "User avatar placeholder, professional headshot style",
    "Dashboard chart illustration, flat design, colorful",
    "Mobile app mockup on a clean background",
  ];

  async function generate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/ai/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, size, style, transparent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const newImage: GeneratedImage = {
        id: `img-${Date.now()}`,
        prompt,
        url: data.url,
        size,
        style,
        createdAt: new Date().toISOString(),
      };
      setImages((prev) => [newImage, ...prev]);
      setSelected(newImage);
    } catch (err: unknown) {
      toast({ title: "Image generation failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function downloadImage(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }

  async function copyUrl(url: string) {
    await navigator.clipboard.writeText(url);
    toast({ title: "URL copied!" });
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Image className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-semibold">Image Generation</span>
        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">DALL-E 3</span>
      </div>

      {/* Selected image viewer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="relative border-b border-border shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.url} alt={selected.prompt} className="w-full h-48 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3 gap-2">
              <p className="text-xs text-white/80 flex-1 line-clamp-2">{selected.prompt}</p>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => copyUrl(selected.url)}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => downloadImage(selected.url, `lifemarkai-${selected.id}.png`)}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gallery */}
      {images.length > 0 && (
        <div className="px-4 py-3 border-b border-border shrink-0">
          <div className="flex gap-2 overflow-x-auto">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => setSelected(img)}
                className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  selected?.id === img.id ? "border-violet-500" : "border-border hover:border-muted-foreground"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Prompt */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Describe your image</label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. App icon for a fintech startup, clean minimalist design, blue gradient..."
            className="min-h-[80px] resize-none text-sm"
            onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) generate(); }}
          />
        </div>

        {/* Quick prompts */}
        {!prompt && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Quick prompts:</p>
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="block w-full text-left text-xs px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent border border-border transition-colors"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Settings */}
        <div className="space-y-3">
          {/* Size */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Size</label>
            <div className="flex gap-1">
              {IMAGE_SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`flex-1 py-1.5 rounded-lg text-xs border transition-all ${
                    size === s ? "bg-violet-500/20 border-violet-500/40 text-violet-300" : "bg-muted border-border hover:bg-accent"
                  }`}
                >
                  {s === "1024x1024" ? "Square" : s === "1792x1024" ? "Wide" : "Tall"}
                </button>
              ))}
            </div>
          </div>

          {/* Style */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Style</label>
            <div className="flex gap-1">
              {IMAGE_STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`flex-1 py-1.5 rounded-lg text-xs border transition-all capitalize ${
                    style === s ? "bg-violet-500/20 border-violet-500/40 text-violet-300" : "bg-muted border-border hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Transparent background */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">Transparent background</label>
            <button
              onClick={() => setTransparent(!transparent)}
              className={`w-10 h-5 rounded-full transition-all relative ${transparent ? "bg-violet-500" : "bg-muted"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${transparent ? "left-5" : "left-0.5"}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Generate button */}
      <div className="p-3 border-t border-border shrink-0">
        <Button
          className="w-full gap-2 bg-gradient-brand text-white hover:opacity-90"
          onClick={generate}
          disabled={!prompt.trim() || loading}
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Generating... (~15s)</>
          ) : (
            <><Sparkles className="w-4 h-4" /> Generate Image · 3 credits</>
          )}
        </Button>
      </div>
    </div>
  );
}
