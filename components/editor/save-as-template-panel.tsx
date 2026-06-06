"use client";

import { useState, useEffect } from "react";
import {
  LayoutTemplate, Sparkles, Globe, Tag, Image, Check,
  Loader2, ExternalLink, RefreshCw, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface SaveAsTemplatePanelProps {
  projectId: string;
  projectName?: string;
}

const CATEGORIES = [
  { id: "landing",    label: "Landing Page" },
  { id: "dashboard",  label: "Dashboard" },
  { id: "saas",       label: "SaaS" },
  { id: "ecommerce",  label: "E-commerce" },
  { id: "portfolio",  label: "Portfolio" },
  { id: "blog",       label: "Blog" },
  { id: "tool",       label: "Tool" },
  { id: "ai",         label: "AI App" },
  { id: "social",     label: "Social" },
  { id: "other",      label: "Other" },
];

interface PublishedTemplate {
  id: string;
  name: string;
  fork_count: number;
  created_at: string;
}

export function SaveAsTemplatePanel({ projectId, projectName = "" }: SaveAsTemplatePanelProps) {
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [previewUrl, setPreviewUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [existingTemplate, setExistingTemplate] = useState<PublishedTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setName(projectName);
  }, [projectName]);

  useEffect(() => {
    checkExisting();
  }, [projectId]);

  async function checkExisting() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-template`);
      const data = await res.json() as { published: boolean; template: PublishedTemplate | null };
      if (data.published && data.template) {
        setExistingTemplate(data.template);
        setPublished(true);
        setName(data.template.name);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !tags.includes(t) && tags.length < 8) {
      setTags((prev) => [...prev, t]);
      setTagInput("");
    }
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  async function handlePublish() {
    if (!name.trim()) {
      toast({ title: "Template name is required", variant: "destructive" });
      return;
    }
    setPublishing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/publish-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          preview_url: previewUrl.trim() || null,
          tags,
        }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to publish");
      setPublished(true);
      if (data.id) setExistingTemplate({ id: data.id, name: name.trim(), fork_count: 0, created_at: new Date().toISOString() });
      toast({ title: "Template published!", description: "It's now live in the community gallery." });
    } catch (err) {
      toast({ title: "Publish failed", description: String(err), variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  }

  function handleRepublish() {
    setPublished(false);
    setExistingTemplate(null);
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
          <LayoutTemplate className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-foreground">Save as Template</h2>
        </div>
        <p className="text-xs text-muted-foreground">Publish this project to the community template gallery</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {published && existingTemplate ? (
          /* Success state */
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">Template published!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-mono">{existingTemplate.name}</span> is live in the gallery
                </p>
              </div>
              <div className="flex gap-2 w-full">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => window.open("/explore", "_blank")}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> View in gallery
                </Button>
                <Button size="sm" variant="ghost" className="flex-1 gap-1.5 text-xs" onClick={handleRepublish}>
                  <RefreshCw className="w-3.5 h-3.5" /> Republish
                </Button>
              </div>
            </div>

            {/* Stats */}
            <div className="rounded-xl border border-border bg-muted/10 p-3">
              <p className="text-xs font-semibold text-foreground mb-2">Template stats</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-violet-400">{existingTemplate.fork_count}</p>
                  <p className="text-[10px] text-muted-foreground">Remixes</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-blue-400">
                    {Math.floor((Date.now() - new Date(existingTemplate.created_at).getTime()) / 86400000)}d
                  </p>
                  <p className="text-[10px] text-muted-foreground">Age</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Publish form */
          <div className="space-y-4">
            {/* Template name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Template name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 80))}
                placeholder="My Awesome Template"
                className="h-8 text-xs bg-muted/30 border-border"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                placeholder="What does this template include? Who is it for?"
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground focus:outline-none focus:border-violet-500/40 placeholder:text-muted-foreground"
              />
              <p className="text-[10px] text-muted-foreground text-right">{description.length}/500</p>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`px-2 py-1 rounded-md text-[10px] border transition-all ${
                      category === cat.id
                        ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                        : "border-border bg-muted/20 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
                <span className="text-muted-foreground font-normal">(up to 8)</span>
              </label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
                  placeholder="nextjs, tailwind, auth…"
                  className="h-7 text-xs bg-muted/30 border-border flex-1"
                  disabled={tags.length >= 8}
                />
                <Button size="sm" variant="outline" className="h-7 w-7 p-0" onClick={addTag} disabled={!tagInput.trim() || tags.length >= 8}>
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px] h-5 px-1.5 gap-1 cursor-pointer hover:bg-red-500/10" onClick={() => removeTag(tag)}>
                      {tag} <X className="w-2.5 h-2.5" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Preview URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1">
                <Image className="w-3 h-3" /> Preview URL
                <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                value={previewUrl}
                onChange={(e) => setPreviewUrl(e.target.value)}
                placeholder="https://your-deployed-app.com"
                className="h-8 text-xs bg-muted/30 border-border"
                type="url"
              />
              <p className="text-[10px] text-muted-foreground">Link to a live demo so others can preview before remixing.</p>
            </div>

            {/* Info box */}
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 flex items-start gap-2">
              <Globe className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">
                Publishing makes all project files publicly visible. Secret values from your Secrets Vault are <span className="text-foreground font-medium">never included</span>.
              </p>
            </div>

            {/* Publish button */}
            <Button
              className="w-full gap-1.5"
              onClick={handlePublish}
              disabled={publishing || !name.trim()}
            >
              {publishing
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Publishing…</>
                : <><Sparkles className="w-4 h-4" /> Publish to gallery</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
