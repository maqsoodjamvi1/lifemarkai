"use client";

import { useState } from "react";
import {
  Download, Upload, FileJson, CheckCircle2, AlertCircle,
  Loader2, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff,
  Copy, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface ConfigExportPanelProps {
  projectId: string;
}

interface ProjectConfig {
  version: string;
  exportedAt: string;
  project: {
    name: string;
    framework: string;
    description?: string;
    knowledge?: string;
    is_public?: boolean;
    metadata?: Record<string, unknown>;
  };
  envVars?: Record<string, string>;
  persona?: Record<string, unknown>;
  featureFlags?: { key: string; enabled: boolean; description?: string }[];
  secrets?: { key: string; description?: string; rotate_after_days?: number }[];  // values excluded for security
}

const SECTION_LABELS: Record<string, string> = {
  project: "Project settings",
  envVars: "Environment variables",
  persona: "AI persona",
  featureFlags: "Feature flags",
  secrets: "Secrets metadata (no values)",
};

export function ConfigExportPanel({ projectId }: ConfigExportPanelProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [configPreviewOpen, setConfigPreviewOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importMode, setImportMode] = useState<"idle" | "input" | "preview" | "done">("idle");
  const [importPreview, setImportPreview] = useState<ProjectConfig | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedSections, setSelectedSections] = useState<Set<string>>(
    new Set(["project", "envVars", "persona", "featureFlags"])
  );

  async function exportConfig() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      selectedSections.forEach((s) => params.append("sections", s));
      const res = await fetch(`/api/projects/${projectId}/config?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as ProjectConfig;
      setConfig(data);

      // Trigger download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lifemarkai-config-${projectId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Config exported" });
    } catch (err) {
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function copyConfig() {
    if (!config) return;
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportJson(text);
      parseImportJson(text);
    };
    reader.readAsText(file);
  }

  function parseImportJson(json: string) {
    setImportError(null);
    try {
      const parsed = JSON.parse(json) as ProjectConfig;
      if (!parsed.version || !parsed.project) throw new Error("Invalid config format — missing version or project fields");
      setImportPreview(parsed);
      setImportMode("preview");
    } catch (err) {
      setImportError(String(err));
      setImportPreview(null);
    }
  }

  async function applyImport() {
    if (!importPreview) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(importPreview),
      });
      if (!res.ok) throw new Error(await res.text());
      setImportMode("done");
      toast({ title: "Config imported successfully" });
    } catch (err) {
      toast({ title: "Import failed", description: String(err), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  function toggleSection(key: string) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const configStr = config ? JSON.stringify(config, null, 2) : null;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <FileJson className="w-4 h-4 text-cyan-400" />
          <h2 className="font-semibold text-foreground">Config Export / Import</h2>
        </div>
        <p className="text-xs text-muted-foreground">Backup and restore all project settings as JSON</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* ── EXPORT ── */}
        <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5 text-cyan-400" /> Export
          </p>

          {/* Section checkboxes */}
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Include sections</p>
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedSections.has(key)}
                  onChange={() => toggleSection(key)}
                  className="w-3 h-3 rounded"
                />
                <span>{label}</span>
                {key === "secrets" && (
                  <Badge variant="outline" className="text-[9px] h-3.5 px-1 border-amber-500/40 text-amber-400">no values</Badge>
                )}
              </label>
            ))}
          </div>

          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={exportConfig}
            disabled={exporting || selectedSections.size === 0}
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {exporting ? "Exporting…" : "Export & Download"}
          </Button>

          {config && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  {Object.keys(config).length} sections · exported {new Date(config.exportedAt).toLocaleTimeString()}
                </span>
                <div className="flex gap-1">
                  <button onClick={copyConfig} className="text-muted-foreground hover:text-foreground p-0.5">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setConfigPreviewOpen((v) => !v)}
                    className="text-muted-foreground hover:text-foreground p-0.5"
                  >
                    {configPreviewOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              {configPreviewOpen && configStr && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <pre className="p-2.5 text-[9px] font-mono text-foreground/80 bg-[#0d1117] overflow-x-auto max-h-48 whitespace-pre-wrap">
                    {configStr.slice(0, 2000)}{configStr.length > 2000 ? "\n…" : ""}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── IMPORT ── */}
        <div className="rounded-xl border border-border bg-muted/10 p-3 space-y-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5 text-violet-400" /> Import
          </p>

          {importMode === "done" ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <p className="text-xs font-medium text-foreground">Config imported successfully</p>
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => { setImportMode("idle"); setImportJson(""); setImportPreview(null); }}>
                <RefreshCw className="w-3.5 h-3.5" /> Import another
              </Button>
            </div>
          ) : importMode === "preview" && importPreview ? (
            <div className="space-y-2">
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-1.5">
                <p className="text-[10px] font-semibold text-emerald-400">Config preview</p>
                <div className="space-y-0.5 text-[10px] text-muted-foreground">
                  <div>Project: <span className="text-foreground font-medium">{importPreview.project?.name ?? "—"}</span></div>
                  <div>Exported: <span className="text-foreground">{importPreview.exportedAt ? new Date(importPreview.exportedAt).toLocaleString() : "unknown"}</span></div>
                  <div>Sections: <span className="text-foreground">{Object.keys(importPreview).filter((k) => !["version", "exportedAt"].includes(k)).join(", ")}</span></div>
                </div>
              </div>

              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground">This will overwrite matching project settings. Review carefully before applying.</p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => { setImportMode("input"); setImportPreview(null); }}>
                  Back
                </Button>
                <Button size="sm" className="flex-1 text-xs gap-1" onClick={applyImport} disabled={importing}>
                  {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Apply import
                </Button>
              </div>
            </div>
          ) : importMode === "input" ? (
            <div className="space-y-2">
              <textarea
                value={importJson}
                onChange={(e) => { setImportJson(e.target.value); setImportError(null); }}
                placeholder='Paste config JSON here… or use the file picker above'
                rows={6}
                className="w-full resize-none rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-[10px] font-mono text-foreground focus:outline-none focus:border-cyan-500/40"
              />
              {importError && (
                <p className="text-[10px] text-red-400 flex items-start gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{importError}
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1 text-xs" onClick={() => setImportMode("idle")}>Cancel</Button>
                <Button size="sm" className="flex-1 text-xs" onClick={() => parseImportJson(importJson)} disabled={!importJson.trim()}>
                  Parse JSON
                </Button>
              </div>
            </div>
          ) : (
            /* idle */
            <div className="space-y-2">
              <label className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-dashed border-border hover:border-cyan-500/40 transition-colors cursor-pointer">
                <Upload className="w-6 h-6 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground">Upload .json config file</span>
                <input type="file" accept=".json" className="sr-only" onChange={handleFileUpload} />
              </label>
              <div className="relative flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <Button size="sm" variant="outline" className="w-full text-xs gap-1.5" onClick={() => setImportMode("input")}>
                <FileJson className="w-3.5 h-3.5" /> Paste JSON manually
              </Button>
            </div>
          )}
        </div>

        {/* Info box */}
        <div className="rounded-xl border border-border bg-muted/5 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold text-foreground">What's included</p>
          <ul className="space-y-0.5 text-[10px] text-muted-foreground">
            <li>· Project name, framework, and description</li>
            <li>· Knowledge / system instructions</li>
            <li>· AI persona configuration</li>
            <li>· Environment variable keys (no values by default)</li>
            <li>· Feature flag definitions</li>
            <li>· Secret key names and rotation settings (no secret values)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
