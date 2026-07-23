"use client";

import { useState } from "react";
import {
  Smartphone, Monitor, Copy, Check, ExternalLink, Terminal,
  Apple, Play, Sparkles, PackagePlus, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { Project, ProjectFile } from "@/types/database";
import { buildCapacitorScaffoldFiles } from "@/lib/native/capacitor-scaffold";

interface NativeDistributionPanelProps {
  project: Project;
  deployedUrl?: string | null;
  onSendToChat?: (prompt: string) => void;
  /** Persist scaffolded native packaging files into the project */
  onFilesUpdate?: (files: ProjectFile[], opts?: { replace?: boolean }) => void;
  files?: ProjectFile[];
}

type Platform = "ios" | "android" | "desktop";

const COMMANDS: Record<Platform, { label: string; cmd: string }[]> = {
  ios: [
    { label: "Add iOS platform", cmd: "npm run cap:add:ios" },
    { label: "Sync web assets", cmd: "npm run cap:sync" },
    { label: "Open Xcode", cmd: "npm run cap:open:ios" },
  ],
  android: [
    { label: "Add Android platform", cmd: "npm run cap:add:android" },
    { label: "Sync web assets", cmd: "npm run cap:sync" },
    { label: "Open Android Studio", cmd: "npm run cap:open:android" },
  ],
  desktop: [
    { label: "Dev (Electron + localhost)", cmd: "npm run electron:dev" },
    { label: "Build macOS", cmd: "npm run electron:build:mac" },
    { label: "Build Windows", cmd: "npm run electron:build:win" },
  ],
};

export function NativeDistributionPanel({
  project,
  deployedUrl,
  onSendToChat,
  onFilesUpdate,
  files = [],
}: NativeDistributionPanelProps) {
  const [platform, setPlatform] = useState<Platform>("ios");
  const [copied, setCopied] = useState<string | null>(null);
  const [scaffolding, setScaffolding] = useState(false);

  const deployUrl = deployedUrl ?? project.deployed_url ?? "https://your-app.lifemarkai.app";
  const alreadyScaffolded = files.some((f) => f.path === "capacitor.config.ts");

  function copy(text: string, id: string) {
    void navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "Copied" });
  }

  async function scaffoldIntoProject() {
    if (!onFilesUpdate) {
      toast({
        title: "Cannot scaffold here",
        description: "Open Native Apps from the editor to write files into the project.",
        variant: "destructive",
      });
      return;
    }
    setScaffolding(true);
    try {
      const scaffold = buildCapacitorScaffoldFiles({
        appName: project.name || "My App",
        serverUrl: deployUrl,
      });
      const byPath = new Map(files.map((f) => [f.path, f]));
      const next: ProjectFile[] = [...files];
      for (const f of scaffold) {
        const existing = byPath.get(f.path);
        let saved: ProjectFile | null = null;
        if (existing?.id && !String(existing.id).startsWith("local-")) {
          const res = await fetch(`/api/projects/${project.id}/files`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: existing.id, content: f.content }),
          });
          if (!res.ok) throw new Error(`Failed to update ${f.path}`);
          saved = (await res.json().catch(() => null)) as ProjectFile | null;
          const idx = next.findIndex((x) => x.path === f.path);
          if (idx >= 0) {
            next[idx] = { ...existing, content: f.content, language: f.language };
          }
        } else {
          const res = await fetch(`/api/projects/${project.id}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: f.path, content: f.content, language: f.language }),
          });
          if (!res.ok) throw new Error(`Failed to write ${f.path}`);
          saved = (await res.json().catch(() => null)) as ProjectFile | null;
          next.push(
            saved ??
              ({
                id: `local-${f.path}`,
                project_id: project.id,
                path: f.path,
                content: f.content,
                language: f.language,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              } as ProjectFile),
          );
        }
      }
      onFilesUpdate(next, { replace: true });
      toast({
        title: "Native packaging scaffolded",
        description: "Added capacitor.config.ts, electron/main.cjs, and NATIVE.md.",
      });
    } catch (err) {
      toast({
        title: "Scaffold failed",
        description: err instanceof Error ? err.message : "Could not write files",
        variant: "destructive",
      });
    } finally {
      setScaffolding(false);
    }
  }

  const mobilePrompt =
    "Optimize this app for mobile: add safe-area padding, touch-friendly tap targets (min 44px), bottom navigation for primary actions, and responsive layouts for phones. Keep the existing design system.";

  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Smartphone className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold">Native Apps</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Ship to App Store, Google Play, or desktop with Capacitor & Electron
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
          Deploy your web app first. Capacitor loads your live URL in a native shell — set{" "}
          <code className="bg-black/20 px-1 rounded">server.url</code> in{" "}
          <code className="bg-black/20 px-1 rounded">capacitor.config.ts</code> to:
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate text-[10px] bg-black/20 px-2 py-1 rounded">{deployUrl}</code>
            <button type="button" onClick={() => copy(deployUrl, "url")} className="p-1 hover:bg-white/10 rounded">
              {copied === "url" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex gap-1 p-0.5 bg-muted rounded-lg">
          {(
            [
              { id: "ios" as const, label: "iOS", icon: Apple },
              { id: "android" as const, label: "Android", icon: Play },
              { id: "desktop" as const, label: "Desktop", icon: Monitor },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPlatform(t.id)}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium rounded-md transition ${
                platform === t.id ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              <t.icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Terminal className="w-3 h-3" />
            Commands (run in repo root)
          </div>
          {COMMANDS[platform].map((c) => (
            <div key={c.cmd} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/20">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-muted-foreground">{c.label}</div>
                <code className="text-[11px] font-mono">{c.cmd}</code>
              </div>
              <button type="button" onClick={() => copy(c.cmd, c.cmd)} className="p-1.5 hover:bg-muted rounded">
                {copied === c.cmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>

        <Button
          size="sm"
          className="w-full text-xs gap-1.5"
          onClick={() => void scaffoldIntoProject()}
          disabled={scaffolding}
        >
          {scaffolding ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <PackagePlus className="w-3.5 h-3.5" />
          )}
          {alreadyScaffolded ? "Update Capacitor scaffold in project" : "Scaffold Capacitor into project"}
        </Button>

        {onSendToChat && (platform === "ios" || platform === "android") && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs gap-1.5"
            onClick={() => onSendToChat(mobilePrompt)}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Ask AI to mobile-optimize UI
          </Button>
        )}

        <a
          href="/docs/native-apps"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-[11px] text-violet-400 hover:underline"
        >
          Full native apps guide <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
