
import { useState,useRef,useEffect } from "react";
import {
Globe,Lock,Shield,ChevronDown,ChevronUp,CheckCircle2,
AlertTriangle,Upload,Image,Type,FileText,ExternalLink,
Copy,Check,Rocket,RefreshCw,Eye,EyeOff,History,
Loader2,HelpCircle,Info,BarChart3
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Project } from "@/types/database";
import { LovableGuestCommentsSetup } from "@/components/editor/lovable/guest-comments-setup";

/* ─── Data ─────────────────────────────────────────────── */

const FAQ_ITEMS = [
  { q: "Does publishing expose my project and code?", a: "No. Publishing only makes the app available at the published URL. It does not grant anyone access to your project in the editor or your project code." },
  { q: "Can I restrict who can access my published app?", a: "Yes. 'Workspace' limits it to signed-in members of your workspace, 'Private' to you alone, and 'Custom' lets you grant access to specific groups, people or external email addresses. The setting is enforced when the app loads." },
  { q: "Why do I not see my latest changes on the live site?", a: "Publishing deploys a snapshot. Changes are not automatically pushed. Click Publish then Update to deploy new changes." },
  { q: "How do I change my published URL?", a: "On paid plans, you can add a custom domain. The default subdomain is fixed after first publish." },
  { q: "Why can I not publish my project?", a: "Publishing errors are usually caused by build issues. Check the console errors in the Preview panel and ask the AI to fix them." },
];

/* ─── Types ─────────────────────────────────────────────── */

interface PublishPanelProps {
  project: Project;
  onSwitchPanel?: (panel: string) => void;
  onDeploy?: () => void;
  /** Optional override — when omitted, panel compares project.updated_at vs last deploy. */
  hasUnpublishedChanges?: boolean;
}

/* ─── Component ─────────────────────────────────────────── */

export function PublishPanel({ project, onSwitchPanel, onDeploy, hasUnpublishedChanges: hasUnpublishedProp }: PublishPanelProps) {
  const [activeSection, setActiveSection] = useState<"publish" | "settings" | "faq">("publish");
  // Mirrors projects.publish_audience (migration 157). "custom" defers to
  // project_publish_grants and is managed from the audience endpoint.
  const [websiteAccess, setWebsiteAccess] = useState<"public" | "workspace" | "private" | "custom">("public");
  const [siteTitle, setSiteTitle]  = useState(project.name ?? "");
  const [siteDesc,  setSiteDesc]   = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [ogImageUrl, setOgImageUrl] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [copiedUrl, setCopiedUrl]  = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [savedMeta, setSavedMeta]  = useState(false);
  const [hasUnpublishedFetched, setHasUnpublishedFetched] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const ogInputRef   = useRef<HTMLInputElement>(null);

  const isPublished   = Boolean(project.deployed_url);
  const publishedUrl  = project.deployed_url ?? "";
  const hasUnpublishedChanges = hasUnpublishedProp ?? hasUnpublishedFetched;

  // Lovable-parity: banner when live site is behind the latest project save.
  useEffect(() => {
    if (hasUnpublishedProp != null || !project.deployed_url) {
      setHasUnpublishedFetched(false);
      return;
    }
    let cancelled = false;
    void fetch(`/api/deploy/status?projectId=${project.id}`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { deployedAt?: string | null };
        if (!res.ok || cancelled || !data.deployedAt) return;
        const updatedAt = project.updated_at ? new Date(project.updated_at).getTime() : 0;
        const deployedAt = new Date(data.deployedAt).getTime();
        setHasUnpublishedFetched(updatedAt > deployedAt);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [project.id, project.deployed_url, project.updated_at, hasUnpublishedProp]);

  // websiteAccess used to always start at "public" and was never loaded from
  // the project's actual saved audience. Because handleDeploy PUTs whatever
  // websiteAccess currently holds on every deploy, simply reopening this
  // panel on a project set to "Private"/"Workspace only" and clicking
  // "Update Live Site" silently reverted it back to public. Load the real
  // saved value on mount.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/projects/${project.id}/publish-audience`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { audience?: "public" | "workspace" | "private" | "custom" };
        if (!cancelled && data.audience) setWebsiteAccess(data.audience);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [project.id]);

  /* ── Actions ── */

  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      const res = await fetch(`/api/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Deploy failed");
      }
      onDeploy?.();

      // Persist who may view the published app.
      //
      // This used to PATCH `{ visibility: websiteAccess }` to /api/projects/:id — a
      // field that route does not handle, against a column that does not exist. The
      // value was silently dropped, so the access tier the user picked here was
      // never stored and never enforced, while the FAQ below promised it was. It now
      // goes to the dedicated audience endpoint, which /api/embed/access reads.
      //
      // A failure here is surfaced rather than swallowed: silently failing to apply
      // an access restriction is how an internal app ends up public.
      try {
        const accessRes = await fetch(`/api/projects/${project.id}/publish-audience`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audience: websiteAccess }),
        });
        if (!accessRes.ok) {
          const body = await accessRes.json().catch(() => ({}));
          toast({
            title: "Access setting not saved",
            description:
              (body as { error?: string }).error ??
              "The app is deploying, but who can view it was not changed. Re-apply it in the Publish panel.",
            variant: "destructive",
          });
        }
      } catch {
        toast({
          title: "Access setting not saved",
          description: "The app is deploying, but who can view it was not changed.",
          variant: "destructive",
        });
      }

      toast({ title: isPublished ? "Update queued" : "Deployment started", description: "Your project is being deployed." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deploy failed";
      toast({ title: "Deploy error", description: msg, variant: "destructive" });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(publishedUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
    toast({ title: "Copied", description: "URL copied to clipboard." });
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, type: "favicon" | "ogImage") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      if (type === "favicon") setFaviconUrl(b64);
      else setOgImageUrl(b64);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMeta = async () => {
    // Persist metadata via projects API. Only description/favicon/OG image
    // are included when the user actually typed/picked something this
    // session — these fields aren't hydrated from `project` on mount, so
    // unconditionally sending the (blank) initial state would silently wipe
    // out whatever was saved previously.
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: siteTitle || project.name,
          ...(siteDesc.trim() ? { description: siteDesc.trim() } : {}),
          ...(faviconUrl ? { favicon_url: faviconUrl } : {}),
          ...(ogImageUrl ? { og_image_url: ogImageUrl } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Save failed");
      }
      setSavedMeta(true);
      setTimeout(() => setSavedMeta(false), 2000);
      toast({ title: "Settings saved" });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    }
  };

  const tabs = [
    { key: "publish"  as const, label: isPublished ? "Update" : "Publish", icon: isPublished ? RefreshCw : Rocket },
    { key: "settings" as const, label: "Settings", icon: Type },
    { key: "faq"      as const, label: "FAQ",       icon: HelpCircle },
  ];

  return (
    <div className="h-full flex flex-col text-foreground">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border flex-shrink-0">
        <Globe size={14} className="text-blue-500" />
        <h3 className="text-[12px] font-semibold flex-1">Publish</h3>
        {isPublished && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 text-[9px] font-medium rounded-full">
            <CheckCircle2 size={8} /> Live
          </span>
        )}
      </div>

      {/* Static apps: demo-grade persistence — say so before users ship (step 3) */}
      {(project.framework as string) === "static" && (
        <div className="mx-3 mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-relaxed text-amber-600 dark:text-amber-300">
          This app uses demo-grade shared storage (LifemarkData) — great for demos and
          internal tools. For secure accounts, private data or payments, ask the AI to
          &quot;upgrade to full-stack&quot; before going live.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveSection(t.key)}
              className={`flex items-center gap-1 px-3 py-2 text-[11px] font-medium transition border-b-2 whitespace-nowrap ${
                activeSection === t.key
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={10} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">

        {/* ═══ PUBLISH TAB ═══ */}
        {activeSection === "publish" && (
          <div className="space-y-3">
            {isPublished && hasUnpublishedChanges && (
              <div className="flex items-start gap-2 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10">
                <AlertTriangle size={12} className="text-amber-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Unpublished changes</p>
                  <p className="text-[10px] text-amber-800/70 dark:text-amber-200/70 mt-0.5">
                    Your editor has edits that aren&apos;t on the live site yet. Click Update to publish them.
                  </p>
                </div>
              </div>
            )}

            {/* Published URL card */}
            {isPublished && publishedUrl && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-green-400 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Published URL
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={publishedUrl}
                    className="flex-1 text-[11px] text-foreground bg-background border border-border rounded-lg px-2 py-1.5 font-mono outline-none"
                  />
                  <button
                    onClick={handleCopyUrl}
                    className="p-1.5 bg-background border border-border rounded-lg hover:bg-muted transition"
                    title="Copy URL"
                  >
                    {copiedUrl
                      ? <Check size={12} className="text-green-400" />
                      : <Copy size={12} className="text-muted-foreground" />
                    }
                  </button>
                  <a
                    href={publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-background border border-border rounded-lg hover:bg-muted transition"
                    title="Open live site"
                  >
                    <ExternalLink size={12} className="text-muted-foreground" />
                  </a>
                </div>
              </div>
            )}

            {/* Website Access */}
            <div>
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                Who can see the website
              </label>
              <div className="space-y-1.5">
                {[
                  { key: "public"    as const, label: "Anyone",         desc: "Anyone with the URL can visit",             icon: Globe },
                  { key: "workspace" as const, label: "Workspace only", desc: "Only authenticated workspace members",      icon: Lock  },
                  { key: "private"   as const, label: "Private",         desc: "Only you (the owner) can access",           icon: Lock  },
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setWebsiteAccess(opt.key)}
                      className={`w-full text-left p-2.5 rounded-lg border-2 transition flex items-center gap-2.5 ${
                        websiteAccess === opt.key
                          ? "border-blue-500/50 bg-blue-500/10"
                          : "border-border hover:border-border/80"
                      }`}
                    >
                      <Icon size={13} className={websiteAccess === opt.key ? "text-blue-400" : "text-muted-foreground"} />
                      <div>
                        <span className="text-[11px] font-medium text-foreground">{opt.label}</span>
                        <p className="text-[9px] text-muted-foreground">{opt.desc}</p>
                      </div>
                      {websiteAccess === opt.key && <CheckCircle2 size={12} className="text-blue-400 ml-auto flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Site preview card */}
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                Site Preview
              </span>
              <div className="flex items-start gap-2.5">
                <div className="w-10 h-10 bg-background border border-border rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {faviconUrl
                    ? <img src={faviconUrl} alt="" className="w-6 h-6 object-contain" />
                    : <Globe size={16} className="text-muted-foreground/30" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-blue-400 truncate">{siteTitle || project.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{publishedUrl || "Not yet published"}</p>
                  <p className="text-[9px] text-muted-foreground/60 mt-0.5 line-clamp-2">
                    {siteDesc || "No description set. Add one for better SEO and social sharing."}
                  </p>
                </div>
              </div>
              {ogImageUrl ? (
                <div className="mt-2 rounded-lg overflow-hidden border border-border">
                  <img src={ogImageUrl} alt="OG Preview" className="w-full h-20 object-cover" />
                </div>
              ) : (
                <div className="mt-2 h-12 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border border-border flex items-center justify-center">
                  <span className="text-[9px] text-muted-foreground/60">No social sharing image</span>
                </div>
              )}
            </div>

            {/* Quick links to other panels */}
            {isPublished && (
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => onSwitchPanel?.("deploys")}
                  className="flex items-center gap-1.5 p-2.5 bg-muted/50 border border-border rounded-lg hover:bg-muted transition text-left"
                >
                  <History size={12} className="text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-[10px] font-medium text-foreground block">Deploy History</span>
                    <span className="text-[8px] text-muted-foreground">View all deploys</span>
                  </div>
                </button>
                <button
                  onClick={() => onSwitchPanel?.("analytics")}
                  className="flex items-center gap-1.5 p-2.5 bg-muted/50 border border-border rounded-lg hover:bg-muted transition text-left"
                >
                  <BarChart3 size={12} className="text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-[10px] font-medium text-foreground block">Analytics</span>
                    <span className="text-[8px] text-muted-foreground">Visitors & views</span>
                  </div>
                </button>
                <button
                  onClick={() => onSwitchPanel?.("domains")}
                  className="flex items-center gap-1.5 p-2.5 bg-muted/50 border border-border rounded-lg hover:bg-muted transition text-left"
                >
                  <Globe size={12} className="text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-[10px] font-medium text-foreground block">Custom Domain</span>
                    <span className="text-[8px] text-muted-foreground">Add your own domain</span>
                  </div>
                </button>
                <button
                  onClick={() => onSwitchPanel?.("security")}
                  className="flex items-center gap-1.5 p-2.5 bg-muted/50 border border-border rounded-lg hover:bg-muted transition text-left"
                >
                  <Shield size={12} className="text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="text-[10px] font-medium text-foreground block">Security Scan</span>
                    <span className="text-[8px] text-muted-foreground">Check for issues</span>
                  </div>
                </button>
              </div>
            )}

            {/* Deploy button */}
            <button
              onClick={handleDeploy}
              disabled={isDeploying}
              className="w-full py-2.5 bg-foreground text-background text-[12px] font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isDeploying
                ? <><Loader2 size={14} className="animate-spin" /> Deploying…</>
                : isPublished
                  ? <><RefreshCw size={14} /> Update Live Site</>
                  : <><Rocket size={14} /> Publish Project</>
              }
            </button>

            {/* Info note */}
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start gap-1.5">
                <Info size={11} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-[9px] text-blue-400 leading-relaxed">
                  {isPublished
                    ? "Your project is live. Click Update Live Site to push the latest changes."
                    : "Publish your project to make it accessible via a public URL. Build errors will prevent a successful deploy."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══ SETTINGS TAB ═══ */}
        {activeSection === "settings" && (
          <div className="space-y-3">
            {/* Icon & Title */}
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Type size={11} className="text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Icon &amp; Title</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 bg-background border-2 border-dashed border-border rounded-xl flex items-center justify-center hover:border-blue-500/50 transition flex-shrink-0 overflow-hidden"
                >
                  {faviconUrl
                    ? <img src={faviconUrl} alt="" className="w-8 h-8 object-contain" />
                    : <Upload size={16} className="text-muted-foreground/50" />
                  }
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                  onChange={(e) => handleFileSelected(e, "favicon")} />
                <div className="flex-1">
                  <input
                    value={siteTitle}
                    onChange={(e) => setSiteTitle(e.target.value)}
                    placeholder={project.name ?? "Site Title"}
                    className="w-full text-[12px] border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground outline-none focus:ring-1 focus:ring-blue-500/30"
                  />
                  <p className="text-[8px] text-muted-foreground mt-0.5">Shown in browser tabs and search results</p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={11} className="text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Meta Description</span>
              </div>
              <textarea
                value={siteDesc}
                onChange={(e) => setSiteDesc(e.target.value)}
                placeholder="Describe your site for search engines and social media…"
                rows={3}
                maxLength={500}
                className="w-full text-[11px] border border-border rounded-lg px-2.5 py-1.5 bg-background text-foreground outline-none focus:ring-1 focus:ring-blue-500/30 resize-none"
              />
              <div className="flex justify-between mt-1">
                <span className="text-[8px] text-muted-foreground">{siteDesc.length}/500</span>
                <span className="text-[8px] text-muted-foreground">Used in search results and link previews</span>
              </div>
            </div>

            {/* OG Image */}
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Image size={11} className="text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Social Sharing Image</span>
              </div>
              <input ref={ogInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => handleFileSelected(e, "ogImage")} />
              <button
                onClick={() => ogInputRef.current?.click()}
                className="w-full h-24 bg-background border-2 border-dashed border-border rounded-xl flex items-center justify-center hover:border-blue-500/50 transition overflow-hidden"
              >
                {ogImageUrl ? (
                  <img src={ogImageUrl} alt="OG" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center">
                    <Upload size={18} className="text-muted-foreground/50 mx-auto mb-1" />
                    <span className="text-[9px] text-muted-foreground">Click to upload OG image</span>
                  </div>
                )}
              </button>
              <p className="text-[8px] text-muted-foreground mt-1">Shown when your link is shared on social media (1200×630 recommended)</p>
            </div>

            {/* Website Access */}
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <div className="flex items-center gap-1.5 mb-2">
                {websiteAccess === "public" ? <Eye size={11} className="text-muted-foreground" /> : <EyeOff size={11} className="text-muted-foreground" />}
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Website Access</span>
              </div>
              <div className="flex gap-1.5">
                {[
                  { key: "public"    as const, label: "Public",    desc: "Anyone with URL" },
                  { key: "workspace" as const, label: "Workspace", desc: "Members only" },
                  { key: "private"   as const, label: "Private",   desc: "Owner only" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setWebsiteAccess(opt.key)}
                    className={`flex-1 p-2 rounded-lg border-2 text-center transition ${
                      websiteAccess === opt.key
                        ? "border-blue-500/50 bg-blue-500/10"
                        : "border-border hover:border-border/80"
                    }`}
                  >
                    <span className="text-[11px] font-medium text-foreground">{opt.label}</span>
                    <p className="text-[8px] text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Guest preview comments */}
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <LovableGuestCommentsSetup
                projectId={project.id}
                isPublic={websiteAccess === "public" || !!project.is_public}
              />
            </div>

            {/* Save button */}
            <button
              onClick={handleSaveMeta}
              className="w-full py-2.5 bg-foreground text-background text-[12px] font-semibold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-1.5"
            >
              {savedMeta ? <><Check size={14} /> Saved!</> : <><CheckCircle2 size={14} /> Save Settings</>}
            </button>
          </div>
        )}

        {/* ═══ FAQ TAB ═══ */}
        {activeSection === "faq" && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <div className="flex items-start gap-2">
                <HelpCircle size={12} className="text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-blue-400">Publishing FAQ</p>
                  <p className="text-[9px] text-blue-400/80 mt-0.5">Common questions about publishing your project.</p>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              {FAQ_ITEMS.map((faq, i) => (
                <div key={i} className="border border-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="flex items-center justify-between w-full p-2.5 hover:bg-muted/50 transition"
                  >
                    <span className="text-[10px] text-foreground text-left font-medium">{faq.q}</span>
                    {expandedFaq === i
                      ? <ChevronUp size={10} className="text-muted-foreground flex-shrink-0" />
                      : <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />
                    }
                  </button>
                  {expandedFaq === i && (
                    <div className="px-2.5 pb-2.5 border-t border-border">
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Access matrix */}
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">
                Project vs Website Access
              </span>
              <p className="text-[9px] text-muted-foreground mb-2">These are independent settings:</p>
              <div className="space-y-1.5">
                {[
                  { name: "Internal team app",    project: "Workspace", website: "Workspace", result: "Only members can edit and visit" },
                  { name: "Private WIP, public app", project: "Restricted", website: "Anyone", result: "Only you edit, anyone visits" },
                  { name: "Team-built, public app",  project: "Workspace", website: "Anyone", result: "Team edits, anyone visits" },
                ].map((cfg) => (
                  <div key={cfg.name} className="flex gap-1.5 text-[8px]">
                    <span className="font-medium text-foreground w-28 truncate">{cfg.name}</span>
                    <span className="px-1 py-0.5 bg-blue-500/20 text-blue-400 rounded">{cfg.project}</span>
                    <span className="px-1 py-0.5 bg-green-500/20 text-green-400 rounded">{cfg.website}</span>
                    <span className="text-muted-foreground">{cfg.result}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
