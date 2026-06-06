"use client";

import { useState, useCallback, useEffect } from "react";
import { Smartphone, CheckCircle2, XCircle, AlertCircle, Download, Copy, Check, Loader2, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface PwaPanelProps {
  projectId: string;
  files: ProjectFile[];
  onGenerateFiles: (prompt: string) => void;
}

interface PwaConfig {
  name: string;
  short_name: string;
  description: string;
  theme_color: string;
  background_color: string;
  display: "standalone" | "fullscreen" | "minimal-ui" | "browser";
  start_url: string;
  orientation: "any" | "portrait" | "landscape";
  offline_mode: boolean;
}

interface PwaCheck {
  id: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
}

function extractAppName(files: ProjectFile[]): string {
  const pkg = files.find((f) => f.path.endsWith("package.json"));
  if (pkg?.content) {
    const m = pkg.content.match(/"name"\s*:\s*"([^"]+)"/);
    if (m) return m[1].replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "My App";
}

function runPwaChecks(files: ProjectFile[]): PwaCheck[] {
  const hasManifest   = files.some((f) => f.path.includes("manifest.json") || f.path.includes("manifest.webmanifest"));
  const hasSW         = files.some((f) => f.path.includes("service-worker") || f.path.includes("sw.js"));
  const hasIcon192    = files.some((f) => f.path.includes("icon-192") || f.path.includes("icon.png"));
  const hasIcon512    = files.some((f) => f.path.includes("icon-512"));
  const hasHttpsEnv   = files.some((f) => fileContains(f, "https://") || fileContains(f, "NEXT_PUBLIC_APP_URL"));
  const hasMetaViewport = files.some((f) => fileContains(f, 'name="viewport"') || fileContains(f, "viewport"));
  const hasThemeColor = files.some((f) => fileContains(f, "theme-color") || fileContains(f, "theme_color"));
  const hasAppleTouchIcon = files.some((f) => fileContains(f, "apple-touch-icon") || fileContains(f, "apple-mobile-web-app"));

  return [
    { id: "manifest",    label: "Web manifest",          description: "manifest.json or manifest.webmanifest", status: hasManifest ? "pass" : "fail" },
    { id: "sw",          label: "Service worker",         description: "service-worker.js or sw.js registered",  status: hasSW ? "pass" : "fail" },
    { id: "icon192",     label: "192×192 icon",           description: "PNG icon for Android home screen",        status: hasIcon192 ? "pass" : "warn" },
    { id: "icon512",     label: "512×512 icon",           description: "PNG icon for splash screen",              status: hasIcon512 ? "pass" : "warn" },
    { id: "https",       label: "HTTPS served",           description: "Service workers require HTTPS in production", status: hasHttpsEnv ? "pass" : "warn" },
    { id: "viewport",    label: "Viewport meta tag",      description: "Required for mobile display",             status: hasMetaViewport ? "pass" : "fail" },
    { id: "theme",       label: "Theme color",            description: "Sets browser chrome color on mobile",     status: hasThemeColor ? "pass" : "warn" },
    { id: "apple",       label: "Apple touch icon",       description: "Required for iOS add-to-home-screen",     status: hasAppleTouchIcon ? "pass" : "warn" },
  ];
}

function fileContains(file: ProjectFile, pattern: string): boolean {
  return (file.content ?? "").includes(pattern);
}

function buildManifest(config: PwaConfig): string {
  return JSON.stringify({
    name: config.name,
    short_name: config.short_name || config.name.slice(0, 12),
    description: config.description,
    start_url: config.start_url,
    display: config.display,
    orientation: config.orientation,
    theme_color: config.theme_color,
    background_color: config.background_color,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    screenshots: [],
    categories: ["productivity"],
  }, null, 2);
}

function buildServiceWorker(offlineMode: boolean): string {
  if (!offlineMode) {
    return `// Service Worker — network first, no offline cache
const VERSION = "v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));`;
  }
  return `// Service Worker — cache first with offline fallback
const CACHE_NAME = "app-v1";
const PRECACHE = ["/", "/index.html"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ?? fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      })
    ).catch(() => caches.match("/"))
  );
});`;
}

const DISPLAY_OPTIONS = [
  { id: "standalone",  label: "Standalone",  desc: "Full app, no browser chrome" },
  { id: "fullscreen",  label: "Fullscreen",  desc: "True fullscreen (games)" },
  { id: "minimal-ui",  label: "Minimal UI",  desc: "Minimal browser controls" },
  { id: "browser",     label: "Browser",     desc: "Normal browser tab" },
] as const;

export function PwaPanel({ projectId, files, onGenerateFiles }: PwaPanelProps) {
  const appName = extractAppName(files);

  const [config, setConfig] = useState<PwaConfig>({
    name: appName,
    short_name: appName.slice(0, 12),
    description: `${appName} — a progressive web app`,
    theme_color: "#8b5cf6",
    background_color: "#09090b",
    display: "standalone",
    start_url: "/",
    orientation: "any",
    offline_mode: true,
  });

  const [checks, setChecks] = useState<PwaCheck[]>([]);
  const [activeTab, setActiveTab] = useState<"config" | "manifest" | "sw" | "checklist">("config");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    setChecks(runPwaChecks(files));
  }, [files]);

  const manifestJson = buildManifest(config);
  const swCode = buildServiceWorker(config.offline_mode);

  function copyCode(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function generateAll() {
    const prompt = `Add full PWA support to my project:

1. Create /public/manifest.json with this content:
\`\`\`json
${manifestJson}
\`\`\`

2. Create /public/sw.js with this content:
\`\`\`js
${swCode}
\`\`\`

3. Add to the <head> of my layout/index.html:
\`\`\`html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="${config.theme_color}" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<link rel="apple-touch-icon" href="/icon-192.png" />
\`\`\`

4. Register the service worker — add this script before </body>:
\`\`\`html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
  }
</script>
\`\`\`

5. Add placeholder icon files (icon-192.png and icon-512.png) to /public/ if they don't exist.`;

    onGenerateFiles(prompt);
    toast({ title: "PWA files queued", description: "Check the chat panel to confirm the generation." });
  }

  const passingChecks = checks.filter((c) => c.status === "pass").length;
  const pwaScore = checks.length > 0 ? Math.round((passingChecks / checks.length) * 100) : 0;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-4 h-4 text-sky-400" />
          <h2 className="font-semibold text-foreground">PWA Builder</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-sky-500/30 text-sky-400">
            Score: {pwaScore}%
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Generate manifest + service worker for offline-capable apps</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-2 border-b border-border">
        {(["config", "checklist", "manifest", "sw"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-[10px] font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "sw" ? "Service Worker" : tab === "manifest" ? "manifest.json" : tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === "config" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">App name</label>
                <Input value={config.name} onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))} className="h-8 text-xs bg-muted/30 border-border" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Short name (≤12)</label>
                <Input value={config.short_name} maxLength={12} onChange={(e) => setConfig((c) => ({ ...c, short_name: e.target.value }))} className="h-8 text-xs bg-muted/30 border-border" />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Description</label>
              <Input value={config.description} onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))} className="h-8 text-xs bg-muted/30 border-border" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Theme color</label>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={config.theme_color} onChange={(e) => setConfig((c) => ({ ...c, theme_color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                  <Input value={config.theme_color} onChange={(e) => setConfig((c) => ({ ...c, theme_color: e.target.value }))} className="h-8 text-xs font-mono bg-muted/30 border-border" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-medium text-muted-foreground uppercase">Background color</label>
                <div className="flex items-center gap-1.5">
                  <input type="color" value={config.background_color} onChange={(e) => setConfig((c) => ({ ...c, background_color: e.target.value }))} className="w-8 h-8 rounded cursor-pointer border-0" />
                  <Input value={config.background_color} onChange={(e) => setConfig((c) => ({ ...c, background_color: e.target.value }))} className="h-8 text-xs font-mono bg-muted/30 border-border" />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Display mode</label>
              <div className="grid grid-cols-2 gap-1.5">
                {DISPLAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setConfig((c) => ({ ...c, display: opt.id }))}
                    className={`rounded-lg border p-2 text-left transition-all ${
                      config.display === opt.id ? "border-violet-500/50 bg-violet-500/10" : "border-border bg-muted/20"
                    }`}
                  >
                    <p className="text-[11px] font-medium text-foreground">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">Start URL</label>
              <Input value={config.start_url} onChange={(e) => setConfig((c) => ({ ...c, start_url: e.target.value }))} className="h-8 text-xs bg-muted/30 border-border" placeholder="/" />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
              <div>
                <p className="text-xs font-medium text-foreground">Offline mode</p>
                <p className="text-[11px] text-muted-foreground">Cache pages for offline access</p>
              </div>
              <Switch
                checked={config.offline_mode}
                onCheckedChange={(v) => setConfig((c) => ({ ...c, offline_mode: v }))}
              />
            </div>
          </>
        )}

        {activeTab === "checklist" && (
          <div className="space-y-2">
            {checks.map((check) => (
              <div key={check.id} className={`flex items-start gap-2.5 p-3 rounded-xl border ${
                check.status === "pass" ? "border-border bg-muted/10" :
                check.status === "fail" ? "border-red-500/20 bg-red-500/5" :
                "border-amber-500/20 bg-amber-500/5"
              }`}>
                {check.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> :
                 check.status === "fail" ? <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" /> :
                                           <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
                <div>
                  <p className="text-xs font-medium text-foreground">{check.label}</p>
                  <p className="text-[10px] text-muted-foreground">{check.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {(activeTab === "manifest" || activeTab === "sw") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-muted-foreground uppercase">
                {activeTab === "manifest" ? "public/manifest.json" : "public/sw.js"}
              </label>
              <button onClick={() => copyCode(activeTab, activeTab === "manifest" ? manifestJson : swCode)}>
                {copied === activeTab ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
            <pre className="rounded-xl border border-border bg-muted/20 p-3 text-[10px] font-mono text-foreground overflow-x-auto whitespace-pre-wrap max-h-80">
              {activeTab === "manifest" ? manifestJson : swCode}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button size="sm" className="w-full gap-1.5" onClick={generateAll}>
          <Zap className="w-3.5 h-3.5" />
          Generate PWA files via AI
        </Button>
      </div>
    </div>
  );
}
