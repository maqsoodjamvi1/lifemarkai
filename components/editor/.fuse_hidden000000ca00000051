"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Settings, Save, Loader2, Globe, Lock, Share2,
  Copy, Check, ExternalLink, RefreshCw, Shield,
  Eye, EyeOff, Link2, Trash2, AlertTriangle,
  LayoutTemplate, CheckCircle2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Project, Profile } from "@/types/database";
import { ProjectSkillVisibilityPanel } from "./project-skill-visibility-panel";

interface ProjectSettingsPanelProps {
  project: Project;
  profile: Profile | null;
  onProjectUpdate: (updated: Partial<Project>) => void;
}

// ─── Branded URL editor ───────────────────────────────────────────────────────

function BrandedUrlEditor({
  projectId, appSlug: initialSlug, appUrl,
}: { projectId: string; appSlug: string | null; appUrl: string }) {
  const [slug, setSlug] = useState(initialSlug ?? "");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid" | "saved">("idle");
  const [saving, setSaving] = useState(false);
  const [copiedBranded, setCopiedBranded] = useState(false);
  const { toast } = useToast();

  const brandedUrl = slug ? `${appUrl}/app/${slug}` : null;

  const checkSlug = async (val: string) => {
    if (!val || val.length < 3) { setStatus("idle"); return; }
    setStatus("checking");
    try {
      const res = await fetch(`/api/projects/${projectId}/slug?check=${encodeURIComponent(val)}`);
      const data = await res.json();
      if (!data.available && data.reason) { setStatus("invalid"); return; }
      setStatus(data.available ? "available" : "taken");
    } catch { setStatus("idle"); }
  };

  const handleChange = (val: string) => {
    const cleaned = val.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/--+/g, "-");
    setSlug(cleaned);
    setStatus("idle");
    clearTimeout((handleChange as any)._t);
    (handleChange as any)._t = setTimeout(() => checkSlug(cleaned), 500);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/slug`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_slug: slug || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("saved");
      toast({ title: "Branded URL saved" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Failed to save", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const statusColors: Record<typeof status, string> = {
    idle: "text-slate-500",
    checking: "text-slate-400",
    available: "text-emerald-400",
    taken: "text-red-400",
    invalid: "text-amber-400",
    saved: "text-emerald-400",
  };
  const statusText: Record<typeof status, string> = {
    idle: "3-40 chars, lowercase letters, numbers, hyphens",
    checking: "Checking availability…",
    available: "✓ Available",
    taken: "✗ Already taken",
    invalid: "✗ Invalid format",
    saved: "✓ Saved",
  };

  return (
    <div className="p-3 rounded-xl bg-violet-500/[0.06] border border-violet-500/20 space-y-2.5">
      <div className="flex items-center gap-2 text-xs text-violet-400 font-medium">
        <Link2 className="w-3.5 h-3.5" />
        Branded App URL
      </div>
      <p className="text-[11px] text-slate-500">
        Give your app a memorable short URL at <span className="text-slate-400">{appUrl}/app/your-slug</span>
      </p>

      <div className="flex gap-2">
        <div className="flex-1 flex items-center bg-black/20 rounded-lg border border-white/[0.08] overflow-hidden">
          <span className="px-2 text-[10px] text-slate-600 whitespace-nowrap shrink-0">/app/</span>
          <input
            value={slug}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="my-awesome-app"
            className="flex-1 bg-transparent text-xs text-slate-300 font-mono py-1.5 pr-2 outline-none placeholder:text-slate-600"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || status === "taken" || status === "invalid" || status === "checking"}
          className="px-2.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        </button>
      </div>

      <p className={`text-[10px] ${statusColors[status]}`}>{statusText[status]}</p>

      {brandedUrl && status !== "taken" && status !== "invalid" && (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 text-[11px] text-slate-400 bg-black/20 rounded px-2 py-1 font-mono truncate">
            {brandedUrl}
          </div>
          <button
            onClick={() => { navigator.clipboard.writeText(brandedUrl); setCopiedBranded(true); setTimeout(() => setCopiedBranded(false), 2000); }}
            className="p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
          >
            {copiedBranded ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
          </button>
          <a href={brandedUrl} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded bg-white/[0.05] hover:bg-white/[0.08] transition-colors">
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Publish as Template dialog ───────────────────────────────────────────────

const TEMPLATE_CATEGORIES = [
  { id: "landing", label: "Landing Page" },
  { id: "dashboard", label: "Dashboard" },
  { id: "ecommerce", label: "E-commerce" },
  { id: "saas", label: "SaaS" },
  { id: "portfolio", label: "Portfolio" },
  { id: "blog", label: "Blog" },
  { id: "tool", label: "Tool" },
  { id: "ai", label: "AI App" },
  { id: "social", label: "Social" },
  { id: "other", label: "Other" },
];

function PublishTemplateDialog({
  project,
  onClose,
}: {
  project: Project;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [category, setCategory] = useState("other");
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const { toast } = useToast();

  const handlePublish = async () => {
    if (!name.trim()) return;
    setPublishing(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/publish-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), category }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to publish");
      }
      setPublished(true);
      toast({ title: "Published to community gallery! 🎉" });
    } catch (e) {
      toast({ title: "Publish failed", description: String(e), variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-[#0f1117] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-semibold text-white">Publish as Community Template</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {published ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 text-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            <p className="text-sm font-semibold text-white">Published successfully!</p>
            <p className="text-xs text-slate-500">Your project is now listed in the community template gallery for others to remix.</p>
            <Button onClick={onClose} className="mt-2 h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
              Done
            </Button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Template name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="e.g. SaaS Starter with Auth"
                className="h-8 text-sm bg-white/[0.03] border-white/[0.08]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="What does this template do? What's included?"
                className="text-sm bg-white/[0.03] border-white/[0.08] resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Category</Label>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                      category === c.id
                        ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                        : "border-white/[0.08] text-slate-500 hover:text-slate-300 hover:border-white/20"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-500/[0.08] border border-blue-500/20">
              <p className="text-[11px] text-slate-400">
                Publishing copies your project's current files to the community gallery. Others can remix it to create their own projects. Your original project is unaffected.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handlePublish}
                disabled={publishing || !name.trim()}
                className="h-8 text-xs bg-violet-600 hover:bg-violet-500 text-white"
              >
                {publishing
                  ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Publishing…</>
                  : <><LayoutTemplate className="w-3 h-3 mr-1.5" />Publish template</>
                }
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export function ProjectSettingsPanel({ project, profile, onProjectUpdate }: ProjectSettingsPanelProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [isPublic, setIsPublic] = useState(project.is_public);
  const [remixEnabled, setRemixEnabled] = useState(project.remix_enabled ?? false);
  const [badgeHidden, setBadgeHidden] = useState((project as any).badge_hidden ?? false);
  const [seoTitle, setSeoTitle] = useState(project.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(project.seo_description ?? "");
  const [slug, setSlug] = useState(project.slug ?? "");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [section, setSection] = useState<"general" | "sharing" | "seo" | "analytics" | "skills" | "danger">("general");
  const [showPublish, setShowPublish] = useState(false);
  const { toast } = useToast();

  const isPro = ["pro", "team", "enterprise"].includes(profile?.plan ?? "");
  const confirm = useConfirm();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://lifemarkai.com";
  const username = profile?.username ?? profile?.email?.split("@")[0] ?? "user";
  const shareUrl = slug ? `${appUrl}/p/${username}/${slug}` : null;

  async function save(fields: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated = await res.json();
      onProjectUpdate(updated);
      toast({ title: "Settings saved" });
    } catch {
      toast({ title: "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function generateSlug() {
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ generate_slug: true }),
    });
    const updated = await res.json();
    setSlug(updated.slug ?? "");
    onProjectUpdate({ slug: updated.slug });
  }

  function copyShareUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const SECTIONS = [
    { id: "general", label: "General" },
    { id: "sharing", label: "Sharing" },
    { id: "seo", label: "SEO" },
    { id: "analytics", label: "Analytics" },
    { id: "skills", label: "Skills" },
    { id: "danger", label: "Danger" },
  ] as const;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-white">Project Settings</span>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex border-b border-white/[0.06] px-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors ${
              section === s.id
                ? "text-violet-400 border-b-2 border-violet-500"
                : "text-slate-500 hover:text-slate-300"
            } ${s.id === "danger" ? "text-red-500/60 hover:text-red-400" : ""}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── General ── */}
        {section === "general" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Project Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm bg-white/[0.03] border-white/[0.08]"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="text-sm bg-white/[0.03] border-white/[0.08] resize-none"
                placeholder="What does this project do?"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Framework</Label>
              <div className="h-8 px-3 flex items-center rounded-md bg-white/[0.03] border border-white/[0.08] text-sm text-slate-400">
                {project.framework}
              </div>
            </div>
            <Button
              onClick={() => save({ name, description })}
              disabled={saving}
              className="w-full h-8 bg-violet-600 hover:bg-violet-500 text-xs text-white"
            >
              {saving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Save className="w-3 h-3 mr-1.5" />}
              Save General Settings
            </Button>
          </motion.div>
        )}

        {/* ── Sharing ── */}
        {section === "sharing" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">

            {/* Visibility */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-3">
                {isPublic ? <Globe className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-slate-500" />}
                <div>
                  <div className="text-sm font-medium text-white">{isPublic ? "Public" : "Private"}</div>
                  <div className="text-xs text-slate-500">
                    {isPublic ? "Anyone with the link can view" : "Only you can see this project"}
                  </div>
                </div>
              </div>
              <Switch
                checked={isPublic}
                onCheckedChange={async (v) => {
                  setIsPublic(v);
                  if (!v) setRemixEnabled(false);
                  await save({ is_public: v, remix_enabled: v ? remixEnabled : false });
                }}
              />
            </div>

            {/* Remix */}
            <div className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
              isPublic ? "bg-white/[0.03] border-white/[0.06]" : "bg-white/[0.01] border-white/[0.03] opacity-50"
            }`}>
              <div className="flex items-center gap-3">
                <RefreshCw className={`w-4 h-4 ${remixEnabled ? "text-blue-400" : "text-slate-500"}`} />
                <div>
                  <div className="text-sm font-medium text-white">Enable Remixing</div>
                  <div className="text-xs text-slate-500">Allow others to fork this project</div>
                </div>
              </div>
              <Switch
                checked={remixEnabled}
                disabled={!isPublic}
                onCheckedChange={async (v) => {
                  setRemixEnabled(v);
                  await save({ remix_enabled: v });
                }}
              />
            </div>

            {/* Share URL */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Public URL Slug</Label>
              <div className="flex gap-2">
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  placeholder="my-project"
                  className="h-8 text-sm bg-white/[0.03] border-white/[0.08] font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateSlug}
                  className="h-8 px-2 text-xs border-white/[0.08]"
                  title="Auto-generate slug"
                >
                  <RefreshCw className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => save({ slug })}
                  className="h-8 px-3 text-xs bg-violet-600 hover:bg-violet-500 text-white"
                >
                  <Save className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {shareUrl && isPublic && (
              <div className="p-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 space-y-2">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  <Share2 className="w-3.5 h-3.5" />
                  Share URL
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 text-xs text-slate-400 bg-black/20 rounded-lg px-3 py-2 font-mono truncate">
                    {shareUrl}
                  </div>
                  <button
                    onClick={copyShareUrl}
                    className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                </div>
                <div className="text-xs text-slate-600">
                  {project.remix_count ?? 0} remix{project.remix_count !== 1 ? "es" : ""}
                </div>
              </div>
            )}

            {/* ── LifemarkAI Badge ── */}
            <div className={`flex items-start justify-between p-3 rounded-xl border transition-all ${
              isPro
                ? "bg-white/[0.03] border-white/[0.06]"
                : "bg-white/[0.01] border-white/[0.03]"
            }`}>
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {/* Mini badge preview */}
                <div className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-full bg-black/60 border border-violet-500/30 shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#a78bfa"/>
                    <path d="M2 12L12 17L22 12" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-medium text-white">LifemarkAI Badge</div>
                    {!isPro && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/20 text-violet-400 border border-violet-500/30">
                        PRO
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {isPro
                      ? badgeHidden
                        ? "Badge hidden on deployed apps"
                        : "\"Built with LifemarkAI\" badge shown on deployed apps"
                      : "Upgrade to Pro to remove the badge from deployed apps"}
                  </div>
                </div>
              </div>
              <Switch
                checked={!badgeHidden}
                disabled={!isPro}
                onCheckedChange={async (v) => {
                  const newHidden = !v;
                  setBadgeHidden(newHidden);
                  await save({ badge_hidden: newHidden });
                }}
                className="ml-3 mt-0.5 shrink-0"
              />
            </div>

            {/* ── Branded App URL ── */}
            <BrandedUrlEditor projectId={project.id} appSlug={(project as any).app_slug ?? null} appUrl={appUrl} />

            {/* ── Publish as Template ── */}
            <div className="pt-1 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-300">Community Template</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">Let others remix your project from the template gallery</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] border-white/[0.08] text-slate-400 hover:text-violet-300 hover:border-violet-500/40 gap-1.5"
                  onClick={() => setShowPublish(true)}
                >
                  <LayoutTemplate className="w-3 h-3" />
                  Publish
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── SEO ── */}
        {section === "seo" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="p-3 rounded-lg bg-blue-500/[0.08] border border-blue-500/20">
              <p className="text-xs text-slate-400">
                SEO settings are injected into your deployed app's <code className="text-blue-300">&lt;head&gt;</code>. They affect how your app appears in search results and social shares.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Page Title</Label>
              <Input
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder={project.name}
                maxLength={70}
                className="h-8 text-sm bg-white/[0.03] border-white/[0.08]"
              />
              <p className="text-xs text-slate-600">{seoTitle.length}/70 characters</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Meta Description</Label>
              <Textarea
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                placeholder="A brief description for search engines..."
                maxLength={160}
                rows={3}
                className="text-sm bg-white/[0.03] border-white/[0.08] resize-none"
              />
              <p className="text-xs text-slate-600">{seoDescription.length}/160 characters</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">OG Image URL</Label>
              <Input
                value={project.og_image_url ?? ""}
                onChange={(e) => onProjectUpdate({ og_image_url: e.target.value })}
                placeholder="https://..."
                className="h-8 text-sm bg-white/[0.03] border-white/[0.08] font-mono"
              />
              <p className="text-xs text-slate-600">1200×630px recommended for social sharing</p>
            </div>
            <Button
              onClick={() => save({ seo_title: seoTitle, seo_description: seoDescription })}
              disabled={saving}
              className="w-full h-8 bg-blue-600 hover:bg-blue-500 text-xs text-white"
            >
              {saving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Save className="w-3 h-3 mr-1.5" />}
              Save SEO Settings
            </Button>
          </motion.div>
        )}

        {/* ── Danger ── */}
        {section === "analytics" && (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div>
              <p className="text-xs font-medium mb-1">Analytics beacon</p>
              <p className="text-[11px] text-muted-foreground mb-3">
                Add this snippet to your app&apos;s HTML to enable live visitor tracking and pageview analytics in the LifemarkAI dashboard.
              </p>
              <div className="rounded-lg border border-border bg-[#1e1e2e] overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40">
                  <span className="text-[10px] text-muted-foreground font-mono">beacon snippet</span>
                  <button
                    onClick={() => {
                      const snippet = `<!-- LifemarkAI Analytics -->\n<script>\n(function() {\n  var pid = '${project.id}';\n  var base = '${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.lifemarkai.com"}';\n  var key = sessionStorage.getItem('lmai_vid') || Math.random().toString(36).slice(2);\n  sessionStorage.setItem('lmai_vid', key);\n  function beacon(evt) {\n    navigator.sendBeacon(base + '/api/analytics/beacon', JSON.stringify({ projectId: pid, visitorKey: key, path: location.pathname, referrer: document.referrer, event: evt }));\n  }\n  beacon('pageview');\n  setInterval(function() { beacon('heartbeat'); }, 25000);\n  window.addEventListener('pagehide', function() { beacon('leave'); });\n})();\n</script>`;
                      navigator.clipboard.writeText(snippet).catch(() => {});
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-muted/40 transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <pre className="text-[9px] font-mono p-3 text-muted-foreground overflow-x-auto leading-relaxed whitespace-pre-wrap">
{`<!-- LifemarkAI Analytics -->
<script>
(function() {
  var pid = '${project.id}';
  var base = '${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.lifemarkai.com"}';
  var key = sessionStorage.getItem('lmai_vid') || Math.random().toString(36).slice(2);
  sessionStorage.setItem('lmai_vid', key);
  function beacon(evt) {
    navigator.sendBeacon(base + '/api/analytics/beacon', JSON.stringify({
      projectId: pid, visitorKey: key,
      path: location.pathname, referrer: document.referrer, event: evt
    }));
  }
  beacon('pageview');
  setInterval(function() { beacon('heartbeat'); }, 25000);
  window.addEventListener('pagehide', function() { beacon('leave'); });
})();
</script>`}
                </pre>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                Paste before the closing &lt;/body&gt; tag. No cookies or personal data collected.
              </p>
            </div>
          </motion.div>
        )}

        {section === "skills" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ProjectSkillVisibilityPanel projectId={project.id} />
          </motion.div>
        )}

                {section === "danger" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="p-3 rounded-lg bg-red-500/[0.08] border border-red-500/20 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400">These actions are irreversible. Proceed with caution.</p>
            </div>

            <div className="p-4 rounded-xl border border-white/[0.06] space-y-3">
              <div>
                <p className="text-sm font-medium text-white">Archive Project</p>
                <p className="text-xs text-slate-500 mt-0.5">Hide from dashboard but keep all data.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => save({ status: "archived" })}
                className="h-7 text-xs border-white/[0.08] text-slate-400 hover:text-white"
              >
                Archive
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-red-500/20 space-y-3">
              <div>
                <p className="text-sm font-medium text-red-400">Delete Project</p>
                <p className="text-xs text-slate-500 mt-0.5">Permanently delete this project and all its files. Cannot be undone.</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Delete "${project.name}"?`,
                    description: "This will permanently delete the project and all its files. This cannot be undone.",
                    confirmLabel: "Delete project",
                    variant: "destructive",
                  });
                  if (!ok) return;
                  await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
                  window.location.href = "/dashboard";
                }}
              >
                <Trash2 className="w-3 h-3 mr-1.5" /> Delete Project
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Publish as Template dialog */}
      {showPublish && (
        <PublishTemplateDialog project={project} onClose={() => setShowPublish(false)} />
      )}
    </div>
  );
}
