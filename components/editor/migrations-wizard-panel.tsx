"use client";

import { useState, useMemo, useRef } from "react";
import { GitBranch, Plus, Check, Copy, ChevronDown, ChevronUp, Loader2, Sparkles, FileText, Clock, AlertCircle, HardDrive, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";

interface MigrationsWizardPanelProps {
  projectId: string;
  files: { path: string; content: string }[];
  onInsertCode: (prompt: string) => void;
  onFilesUpdate?: (files: Array<{ path: string; content: string; language?: string }>) => void;
}

interface Migration {
  filename: string;
  index: number;       // 001, 002 …
  content: string;
  summary: string;     // First comment line or first CREATE/ALTER
  applied: boolean;    // Heuristic: all detected files treated as applied
}

function parseMigrations(files: { path: string; content: string }[]): Migration[] {
  return files
    .filter((f) => f.path.match(/supabase\/migrations\/\d+.*\.sql$/))
    .map((f) => {
      const filename = f.path.split("/").pop() ?? f.path;
      const indexMatch = filename.match(/^(\d+)/);
      const index = indexMatch ? parseInt(indexMatch[1], 10) : 0;
      // Summary: first non-empty non-comment line
      const lines = f.content.split("\n").filter((l) => l.trim() && !l.trim().startsWith("--"));
      const summary = lines[0]?.slice(0, 80) ?? filename;
      return { filename, index, content: f.content, summary, applied: true };
    })
    .sort((a, b) => a.index - b.index);
}

function nextMigrationIndex(existing: Migration[]): string {
  const max = existing.reduce((m, mg) => Math.max(m, mg.index), 0);
  return String(max + 1).padStart(3, "0");
}

const MIGRATION_TEMPLATES = [
  { label: "Add column", description: "Add a new column to an existing table", sql: "ALTER TABLE <table_name>\nADD COLUMN <column_name> <type> DEFAULT <default>;" },
  { label: "Create table", description: "Create a new table with RLS", sql: "CREATE TABLE IF NOT EXISTS <table_name> (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n  created_at timestamptz NOT NULL DEFAULT now()\n);\n\nALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;" },
  { label: "Add index", description: "Add a performance index", sql: "CREATE INDEX IF NOT EXISTS idx_<table>_<column>\n  ON <table>(<column>);" },
  { label: "Add FK", description: "Add foreign key constraint", sql: "ALTER TABLE <table>\n  ADD CONSTRAINT fk_<name>\n  FOREIGN KEY (<column>)\n  REFERENCES <ref_table>(id)\n  ON DELETE CASCADE;" },
];

export function MigrationsWizardPanel({ projectId, files, onInsertCode, onFilesUpdate }: MigrationsWizardPanelProps) {
  const migrations = useMemo(() => parseMigrations(files), [files]);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generatedSQL, setGeneratedSQL] = useState("");
  const [generatedFilename, setGeneratedFilename] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"history" | "generate" | "templates" | "backups">("history");
  const [backups, setBackups] = useState<Array<{id:string;label:string;size_bytes:number|null;status:string;created_at:string}>>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [deletingBackup, setDeletingBackup] = useState<string|null>(null);
  const [backupLabel, setBackupLabel] = useState("");
  const [restoringBackup, setRestoringBackup] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  async function generateMigration() {
    if (!description.trim() || generating) return;
    setGenerating(true);
    setGeneratedSQL("");

    // Build context from existing migrations
    const existing = migrations.map((m) => `-- ${m.filename}: ${m.summary}`).join("\n");
    const nextIdx = nextMigrationIndex(migrations);
    const prompt = `You are a PostgreSQL + Supabase migration expert.

Generate a complete SQL migration for this request:
"${description.trim()}"

Existing migrations for context:
${existing || "(none yet)"}

Requirements:
- Use IF NOT EXISTS / IF EXISTS guards where appropriate
- Add RLS policies if creating tables
- Add indexes for foreign keys
- Use gen_random_uuid() for primary keys
- Include descriptive SQL comments
- Return ONLY the SQL, no markdown, no explanation

Migration index: ${nextIdx}`;

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          model: DEFAULT_CODING_MODEL,
          mode: "chat",
          projectId: "migrations",
        }),
      });

      if (!res.ok || !res.body) throw new Error("AI request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") break;
          try {
            const p = JSON.parse(data) as { content?: string };
            if (p.content) accumulated += p.content;
          } catch { /* skip */ }
        }
      }

      // Strip markdown fences if present
      const sql = accumulated.replace(/```sql\n?/g, "").replace(/```\n?/g, "").trim();
      const slugDesc = description.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
      setGeneratedSQL(sql);
      setGeneratedFilename(`${nextIdx}_${slugDesc}.sql`);
    } catch {
      toast({ title: "Generation failed", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  function copySQL() {
    navigator.clipboard.writeText(generatedSQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function insertMigration() {
    if (!generatedSQL) return;
    onInsertCode(
      `Create the file \`supabase/migrations/${generatedFilename}\` with this content:\n\n\`\`\`sql\n${generatedSQL}\n\`\`\`\n\nAlso update any relevant TypeScript types if needed.`
    );
  }

  function useTemplate(sql: string, label: string) {
    const nextIdx = nextMigrationIndex(migrations);
    const slug = label.toLowerCase().replace(/\s+/g, "_");
    setGeneratedSQL(sql);
    setGeneratedFilename(`${nextIdx}_${slug}.sql`);
    setActiveTab("generate");
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <GitBranch className="w-4 h-4 text-orange-400" />
          <h2 className="font-semibold text-foreground">Migrations Wizard</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {migrations.length} migrations
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Generate and track Supabase schema migrations</p>
      </div>

      {/* Load backups on tab select */}
      {activeTab === "backups" && backups.length === 0 && !backupsLoading && (() => {
        setBackupsLoading(true);
        fetch(`/api/projects/db-backup?projectId=${projectId}`)
          .then(r => r.json()).then(d => setBackups(d ?? [])).finally(() => setBackupsLoading(false));
        return null;
      })()}

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {(["history", "generate", "templates", "backups"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* History tab */}
      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {migrations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <FileText className="w-7 h-7 text-muted-foreground/30" />
              <p className="text-sm font-medium text-foreground">No migrations found</p>
              <p className="text-xs text-muted-foreground">Create your first migration in the Generate tab.</p>
            </div>
          ) : (
            migrations.map((mg) => (
              <div key={mg.filename} className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                <button
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded(expanded === mg.filename ? null : mg.filename)}
                >
                  <span className="font-mono text-[10px] text-muted-foreground/60 shrink-0">{String(mg.index).padStart(3, "0")}</span>
                  <span className="text-xs font-medium text-foreground flex-1 text-left truncate">{mg.filename.replace(/^\d+_/, "").replace(/\.sql$/, "")}</span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500/40 text-emerald-400 shrink-0">
                    <Check className="w-2.5 h-2.5 mr-0.5" />applied
                  </Badge>
                  {expanded === mg.filename
                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                </button>
                {expanded === mg.filename && (
                  <div className="border-t border-border">
                    <pre className="p-3 text-[10px] font-mono text-foreground/80 overflow-x-auto bg-[#0d1117] max-h-48 whitespace-pre-wrap">
                      {mg.content.slice(0, 1200)}{mg.content.length > 1200 ? "\n…" : ""}
                    </pre>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Generate tab */}
      {activeTab === "generate" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          <div className="space-y-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) generateMigration(); }}
              placeholder="e.g. Add a posts table with title, content, and author FK"
              className="text-xs bg-muted/20 border-border"
            />
            <Button size="sm" className="w-full gap-1.5" onClick={generateMigration} disabled={generating || !description.trim()}>
              {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {generating ? "Generating…" : "Generate Migration SQL"}
            </Button>
          </div>

          {generatedSQL && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <code className="text-[10px] font-mono text-orange-400">{generatedFilename}</code>
                <div className="flex gap-1">
                  <button onClick={copySQL} className="text-muted-foreground hover:text-foreground p-1 rounded">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-border overflow-hidden">
                <pre className="p-3 text-[10px] font-mono text-foreground/90 bg-[#0d1117] overflow-x-auto max-h-64 whitespace-pre-wrap">
                  {generatedSQL}
                </pre>
              </div>

              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground">Review the SQL carefully before applying. Run it in the DB Query panel or Supabase dashboard.</p>
              </div>

              <Button size="sm" className="w-full gap-1.5" onClick={insertMigration}>
                <Plus className="w-3.5 h-3.5" /> Save as migration file
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Templates tab */}
      {activeTab === "templates" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {MIGRATION_TEMPLATES.map((tpl) => (
            <div key={tpl.label} className="rounded-xl border border-border bg-muted/10 p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{tpl.label}</p>
                  <p className="text-[10px] text-muted-foreground">{tpl.description}</p>
                </div>
                <Button size="sm" variant="outline" className="text-[10px] h-6 px-2 shrink-0" onClick={() => useTemplate(tpl.sql, tpl.label)}>
                  Use
                </Button>
              </div>
              <pre className="text-[9px] font-mono text-muted-foreground bg-muted/20 rounded p-2 overflow-x-auto">
                {tpl.sql}
              </pre>
            </div>
          ))}
        </div>
      )}

      {/* Backups tab */}
      {activeTab === "backups" && (
        <div className="p-3 space-y-3">
          {/* Create backup */}
          <div className="flex gap-2">
            <input
              placeholder="Backup label (optional)…"
              value={backupLabel}
              onChange={(e) => setBackupLabel(e.target.value)}
              className="flex-1 h-8 text-xs rounded-md border border-border bg-background px-3"
            />
            <Button
              size="sm"
              className="h-8 px-3 text-xs gap-1.5"
              disabled={creatingBackup}
              onClick={async () => {
                setCreatingBackup(true);
                try {
                  const res = await fetch("/api/projects/db-backup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ projectId, label: backupLabel.trim() || undefined }),
                  });
                  const data = await res.json();
                  if (!res.ok) { alert(data.error ?? "Backup failed"); return; }
                  // Download the SQL content
                  const blob = new Blob([data.content], { type: "text/plain" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url;
                  a.download = `backup-${Date.now()}.sql`; a.click();
                  URL.revokeObjectURL(url);
                  setBackupLabel("");
                  setBackups((prev) => [{ id: data.id, label: data.label, size_bytes: data.size_bytes, status: data.status, created_at: data.created_at }, ...prev]);
                } finally { setCreatingBackup(false); }
              }}
            >
              {creatingBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <HardDrive className="w-3.5 h-3.5" />}
              Backup
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Exports all project files as a downloadable SQL archive. Restore by uploading a previously exported .sql file.
          </p>

          <input
            ref={restoreInputRef}
            type="file"
            accept=".sql,text/plain"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setRestoringBackup(true);
              try {
                const content = await file.text();
                const res = await fetch("/api/projects/db-backup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "restore", projectId, content }),
                });
                const data = await res.json();
                if (!res.ok) {
                  toast({ title: "Restore failed", description: data.error ?? "Invalid backup file", variant: "destructive" });
                  return;
                }
                if (data.files && onFilesUpdate) {
                  onFilesUpdate(data.files);
                }
                toast({
                  title: "Backup restored",
                  description: `${data.restored} file${data.restored === 1 ? "" : "s"} restored from ${file.name}`,
                });
              } finally {
                setRestoringBackup(false);
                e.target.value = "";
              }
            }}
          />

          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs gap-1.5 w-full"
            disabled={restoringBackup}
            onClick={() => restoreInputRef.current?.click()}
          >
            {restoringBackup ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Restore from .sql file
          </Button>

          {/* Backup list */}
          {backupsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-4 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading backups…
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HardDrive className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p className="text-xs">No backups yet</p>
              <p className="text-[10px] mt-1 opacity-60">Click "Backup" to create your first snapshot.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div key={b.id} className="rounded-lg border border-border bg-muted/10 p-2.5 flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{b.label}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(b.created_at).toLocaleString()}
                      {b.size_bytes ? ` · ${(b.size_bytes / 1024).toFixed(1)} KB` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-6 h-6"
                      title="Re-download backup"
                      onClick={async () => {
                        const res = await fetch("/api/projects/db-backup", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ projectId, label: b.label }),
                        });
                        const data = await res.json();
                        if (res.ok && data.content) {
                          const blob = new Blob([data.content], { type: "text/plain" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a"); a.href = url;
                          a.download = `${b.label.replace(/\s+/g, "-")}.sql`; a.click();
                          URL.revokeObjectURL(url);
                        }
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-6 h-6 text-muted-foreground hover:text-destructive"
                      title="Delete backup"
                      disabled={deletingBackup === b.id}
                      onClick={async () => {
                        setDeletingBackup(b.id);
                        await fetch(`/api/projects/db-backup?id=${b.id}`, { method: "DELETE" });
                        setBackups((prev) => prev.filter((x) => x.id !== b.id));
                        setDeletingBackup(null);
                      }}
                    >
                      {deletingBackup === b.id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <span className="text-[10px]">✕</span>}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
