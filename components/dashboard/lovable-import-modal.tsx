"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heart, Github, Upload, Loader2, CheckCircle2, AlertCircle,
  FileArchive, ArrowRight, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface LovableImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LovableImportResult {
  projectId: string;
  name: string;
  filesImported: number;
  isLovable: boolean;
  notes: string[];
}

interface DbImportResult {
  applied: boolean;
  applyError: string | null;
  migrationCount: number;
  tables: number;
  totalRows: number;
  skippedTables: string[];
  stagedFiles: string[];
}

type SourceTab = "github" | "zip";

/**
 * Import a project built on Lovable.dev. Two paths, matching Lovable's two
 * export mechanisms: the GitHub repo it two-way-syncs to, or the codebase ZIP
 * (Lovable → Code view → Download). The server strips Lovable-only tooling
 * (lovable-tagger, gptengineer.js, .lovable/) and returns migration notes.
 */
export function LovableImportModal({ open, onOpenChange }: LovableImportModalProps) {
  const [tab, setTab] = useState<SourceTab>("github");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LovableImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Optional database import (source Supabase creds — used once, never stored)
  const [withDb, setWithDb] = useState(false);
  const [dbUrl, setDbUrl] = useState("");
  const [dbKey, setDbKey] = useState("");
  const [dbResult, setDbResult] = useState<DbImportResult | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbPhase, setDbPhase] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  function reset() {
    setRepoUrl("");
    setBranch("");
    setZipFile(null);
    setResult(null);
    setError(null);
    setWithDb(false);
    setDbUrl("");
    setDbKey("");
    setDbResult(null);
    setDbError(null);
    setDbPhase(false);
  }

  function handleOpenChange(next: boolean) {
    if (loading) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleImport() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let res: Response;
      if (tab === "zip") {
        if (!zipFile) return;
        const form = new FormData();
        form.append("zip", zipFile);
        res = await fetch("/api/projects/import-lovable", { method: "POST", body: form });
      } else {
        if (!repoUrl.trim()) return;
        res = await fetch("/api/projects/import-lovable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repoUrl: repoUrl.trim(), branch: branch.trim() || undefined }),
        });
      }
      const data = (await res.json()) as LovableImportResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Import failed (${res.status})`);
      setResult(data);
      toast({ title: "Project imported", description: `${data.filesImported} files — 2 credits used.` });

      // Phase 2 (optional): pull the database from the source Supabase.
      if (withDb && dbUrl.trim() && dbKey.trim()) {
        setDbPhase(true);
        try {
          const dbRes = await fetch(`/api/projects/${data.projectId}/import-database`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sourceUrl: dbUrl.trim(), sourceServiceKey: dbKey.trim() }),
          });
          const dbData = (await dbRes.json()) as DbImportResult & { error?: string };
          if (!dbRes.ok) throw new Error(dbData.error ?? `Database import failed (${dbRes.status})`);
          setDbResult(dbData);
        } catch (dbErr) {
          setDbError(dbErr instanceof Error ? dbErr.message : "Database import failed");
        } finally {
          setDbPhase(false);
          setDbKey(""); // never keep the service key around
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = tab === "zip" ? !!zipFile : !!repoUrl.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-400" />
            Import from Lovable
          </DialogTitle>
          <DialogDescription>
            Bring a Lovable.dev project into LifemarkAI. Lovable tooling
            (lovable-tagger, editor internals) is stripped automatically.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium">{result.name}</p>
                <p className="text-muted-foreground">
                  {result.filesImported} files imported
                  {result.isLovable ? " · Lovable tooling cleaned up" : ""}
                </p>
              </div>
            </div>

            {dbPhase && (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Importing database (schema + data)…
              </div>
            )}
            {dbResult && (
              <div className={`flex items-start gap-3 rounded-lg border p-3 ${dbResult.applied ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                <CheckCircle2 className={`w-5 h-5 shrink-0 mt-0.5 ${dbResult.applied ? "text-emerald-400" : "text-amber-400"}`} />
                <div className="text-sm">
                  <p className="font-medium">Database {dbResult.applied ? "imported" : "staged"}</p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {dbResult.tables} tables · {dbResult.totalRows} rows
                    {dbResult.migrationCount > 0 ? ` · schema from ${dbResult.migrationCount} migrations` : ""}
                    {dbResult.applied
                      ? " — applied to your Lifemark Cloud backend."
                      : ` — SQL saved to ${dbResult.stagedFiles.join(" + ")}; run it from the DB panel.${dbResult.applyError ? ` (${dbResult.applyError})` : ""}`}
                  </p>
                </div>
              </div>
            )}
            {dbError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                Database import failed: {dbError} — the code import succeeded; you can retry the database from the DB panel later.
              </div>
            )}

            {result.notes.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Info className="w-3.5 h-3.5" /> Migration notes
                </p>
                <ul className="space-y-1.5">
                  {result.notes.map((note, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed pl-3 border-l border-border/60">
                      {note}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              className="w-full gap-2"
              onClick={() => {
                handleOpenChange(false);
                router.push(`/editor/${result.projectId}`);
              }}
            >
              Open in editor <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Source tabs */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTab("github")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  tab === "github"
                    ? "border-pink-500/40 bg-pink-500/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:bg-card/60"
                }`}
              >
                <Github className="w-4 h-4" /> Sync repo
              </button>
              <button
                type="button"
                onClick={() => setTab("zip")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  tab === "zip"
                    ? "border-pink-500/40 bg-pink-500/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:bg-card/60"
                }`}
              >
                <FileArchive className="w-4 h-4" /> ZIP export
              </button>
            </div>

            {tab === "github" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lovable-repo">Lovable sync repository</Label>
                  <Input
                    id="lovable-repo"
                    placeholder="github.com/you/your-lovable-app  or  you/your-lovable-app"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    In Lovable: GitHub → Connected repo. Private repos need your GitHub
                    account connected (editor → Git panel).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lovable-branch">Branch (optional)</Label>
                  <Input
                    id="lovable-branch"
                    placeholder="default branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => setZipFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const dropped = e.dataTransfer.files?.[0];
                    if (dropped && /\.zip$/i.test(dropped.name)) setZipFile(dropped);
                    else if (dropped) setError("That doesn't look like a .zip file");
                  }}
                  className={`w-full rounded-lg border border-dashed transition-colors p-6 flex flex-col items-center gap-2 text-sm text-muted-foreground ${
                    dragging
                      ? "border-pink-500/60 bg-pink-500/10"
                      : "border-border/70 hover:border-pink-500/40 hover:bg-pink-500/5"
                  }`}
                >
                  <Upload className="w-5 h-5" />
                  {zipFile ? (
                    <span className="text-foreground">{zipFile.name} · {(zipFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  ) : (
                    <span>{dragging ? "Drop it!" : "Drop the Lovable codebase ZIP here, or click to browse (max 25 MB)"}</span>
                  )}
                </button>
                <p className="text-[11px] text-muted-foreground">
                  In Lovable: Code view → Download codebase (paid plans).
                </p>
              </div>
            )}

            {/* Optional: complete import with the database */}
            <div className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={withDb}
                  onChange={(e) => setWithDb(e.target.checked)}
                  className="accent-pink-500"
                />
                Also import the database (schema + data)
              </label>
              {withDb && (
                <div className="space-y-2">
                  <Input
                    placeholder="Source Supabase URL — https://xxxx.supabase.co"
                    value={dbUrl}
                    onChange={(e) => setDbUrl(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Source service_role key"
                    value={dbKey}
                    onChange={(e) => setDbKey(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Works for Lovable projects connected to your own Supabase (Project
                    Settings → API). Lovable <span className="text-foreground/80">Cloud</span> doesn&apos;t
                    expose credentials — for those, the schema still imports from the repo&apos;s
                    migrations; data stays behind. The key is used once and never stored.
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <Button
              className="w-full gap-2"
              disabled={!canSubmit || loading || (withDb && (!dbUrl.trim() || !dbKey.trim()))}
              onClick={handleImport}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className="w-4 h-4" />}
              {loading ? (dbPhase ? "Importing database…" : "Importing…") : "Import project (2 credits)"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
