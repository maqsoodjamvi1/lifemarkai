"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Github, Download, Loader2, CheckCircle2, AlertCircle, X } from "lucide-react";
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

interface GitHubImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportResult {
  projectId: string;
  name: string;
  filesImported: number;
  branch: string;
}

export function GitHubImportModal({ open, onOpenChange }: GitHubImportModalProps) {
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  async function handleImport() {
    if (!repoUrl.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: repoUrl.trim(),
          branch: branch.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Import failed");
        return;
      }

      setResult(data as ImportResult);
      toast({
        title: "Import successful",
        description: `Imported ${data.filesImported} files from GitHub`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function handleOpenProject() {
    if (result) {
      router.push(`/editor/${result.projectId}`);
      onOpenChange(false);
    }
  }

  function handleClose() {
    setRepoUrl("");
    setBranch("");
    setResult(null);
    setError(null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            Import from GitHub
          </DialogTitle>
          <DialogDescription>
            Import any public GitHub repository as a new project. Private repos require a connected GitHub account.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="repo-url">Repository URL or owner/repo</Label>
              <Input
                id="repo-url"
                placeholder="https://github.com/vercel/next.js  or  vercel/next.js"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleImport()}
                disabled={loading}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch">
                Branch <span className="text-muted-foreground font-normal">(optional, defaults to main)</span>
              </Label>
              <Input
                id="branch"
                placeholder="main"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <span>⚡</span>
              <span>Costs 2 credits · Max 200 files · Skips node_modules, build artefacts</span>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={loading || !repoUrl.trim()} className="gap-2">
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Import Repository
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          /* Success state */
          <div className="space-y-4 pt-2">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{result.name}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {result.filesImported} files imported from branch <code className="text-xs bg-muted px-1 py-0.5 rounded">{result.branch}</code>
                </p>
              </div>
            </div>

            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={handleClose}>
                Back to Dashboard
              </Button>
              <Button onClick={handleOpenProject} className="gap-2">
                Open Project
                <Github className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
