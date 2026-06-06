"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Github, GitBranch, GitMerge, Upload, Download,
  Plus, ExternalLink, CheckCircle, Loader2, Clock,
  ArrowUp, ArrowDown, AlertTriangle, RefreshCw, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Project, ProjectFile } from "@/types/database";

// ── GitLab icon (simple inline SVG) ──────────────────────────────────────────
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 015.1 2a.43.43 0 01.4.29l2.44 7.49h8.12l2.44-7.49a.42.42 0 01.4-.29.43.43 0 01.4.29l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" />
    </svg>
  );
}

type GitProvider = "github" | "gitlab";

interface GitHubPanelProps {
  project: Project;
  githubUsername: string | null;
  githubToken: string | null;
  gitlabUsername?: string | null;
  gitlabToken?: string | null;
  onProjectUpdated: (project: Partial<Project>) => void;
  files?: ProjectFile[];
}

interface CommitEntry {
  sha: string;
  message: string;
  author: string;
  date: string;
}

interface BranchStatus {
  branch: string;
  ahead: number;
  behind: number;
  diverged: boolean;
}

interface OpenMR {
  number?: number;
  iid?: number;
  title: string;
  url: string;
  state: string;
  createdAt?: string;
  created_at?: string;
}

export function GitHubPanel({
  project,
  githubUsername,
  githubToken,
  gitlabUsername = null,
  gitlabToken = null,
  onProjectUpdated,
  files = [],
}: GitHubPanelProps) {
  // Detect active provider from project.git_provider (new field) or heuristic
  const detectedProvider: GitProvider =
    (project as any).git_provider === "gitlab" ? "gitlab" :
    (project.github_repo ?? "").startsWith("gitlab:") ? "gitlab" :
    "github";

  const [provider, setProvider] = useState<GitProvider>(detectedProvider);
  const [loading, setLoading] = useState<string | null>(null);
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [branchStatus, setBranchStatus] = useState<BranchStatus | null>(null);
  const [openMR, setOpenMR] = useState<OpenMR | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const { toast } = useToast();

  const isGitHub = provider === "github";
  const isGitLab = provider === "gitlab";

  const isConnected = isGitHub ? !!githubToken : !!gitlabToken;
  const username = isGitHub ? githubUsername : gitlabUsername;
  const hasRepo = !!project.github_repo && !((project.github_repo ?? "").startsWith("gitlab:") && isGitHub);
  const displayBranch = branchStatus?.branch ?? project.github_branch ?? null;

  const syncEndpoint = isGitHub ? "/api/github/sync" : "/api/gitlab/sync";
  const commitsEndpoint = isGitHub
    ? `/api/github/commits?repo=${project.github_repo}`
    : `/api/gitlab/commits`;

  // ── Load branch status ───────────────────────────────────────────────────
  const loadBranchStatus = useCallback(async () => {
    if (!hasRepo || !isConnected) return;
    try {
      const res = await fetch(syncEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action: "status" }),
      });
      if (res.ok) setBranchStatus(await res.json());
    } catch {
      // non-critical
    }
  }, [hasRepo, isConnected, project.id, syncEndpoint]);

  useEffect(() => {
    setBranchStatus(null);
    setCommits([]);
    setOpenMR(null);
    loadBranchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  // ── Connect OAuth ────────────────────────────────────────────────────────
  function connectProvider() {
    if (isGitHub) {
      const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
      const redirectUri = `${window.location.origin}/api/github/connect`;
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo&state=${project.id}`;
    } else {
      const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID;
      const redirectUri = `${window.location.origin}/api/gitlab/connect`;
      window.location.href = `https://gitlab.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=api+read_user&state=${project.id}`;
    }
  }

  // ── AI commit message ────────────────────────────────────────────────────
  async function generateCommitMessage() {
    if (files.length === 0) {
      toast({ title: "No files to summarise", variant: "destructive" });
      return;
    }
    setGeneratingMsg(true);
    try {
      const changedFiles = files
        .filter((f) => !f.path.match(/node_modules|\.next|dist\//))
        .slice(0, 20)
        .map((f) => ({ path: f.path, content: (f.content ?? "").slice(0, 300) }));

      const res = await fetch("/api/ai/commit-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, changedFiles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setCommitMessage(data.message);
    } catch (err: unknown) {
      toast({
        title: "Could not generate commit message",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGeneratingMsg(false);
    }
  }

  // ── Sync actions ─────────────────────────────────────────────────────────
  async function syncAction(action: "create" | "push" | "pull") {
    setLoading(action);
    try {
      const body: Record<string, unknown> = { projectId: project.id, action };
      if (action === "push" && commitMessage) body.message = commitMessage;

      const res = await fetch(syncEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const providerLabel = isGitHub ? "GitHub" : "GitLab";

      if (action === "create") {
        onProjectUpdated({ github_repo: data.repo, github_branch: data.branch });
        toast({ title: "Repo created!", description: `${data.repo} is now live on ${providerLabel}.` });
        window.open(data.url, "_blank");
        await loadBranchStatus();
      } else if (action === "push") {
        const changedMsg = data.changed === 0
          ? "Already up to date."
          : `${data.changed} file${data.changed !== 1 ? "s" : ""} pushed to ${data.branch}.`;
        toast({ title: `Pushed to ${providerLabel}`, description: changedMsg });
        setCommitMessage("");
        await loadBranchStatus();
      } else if (action === "pull") {
        toast({ title: `Pulled from ${providerLabel}`, description: `${data.files} files updated.` });
        await loadBranchStatus();
      }
    } catch (err: unknown) {
      toast({
        title: "Sync failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  }

  // ── Open PR / MR ─────────────────────────────────────────────────────────
  async function openMRAction() {
    setLoading("mr");
    try {
      const action = isGitHub ? "pr" : "mr";
      const res = await fetch(syncEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const mr = data.pr ?? data.mr;
      setOpenMR({
        number: mr.number ?? mr.iid,
        iid: mr.iid,
        title: mr.title,
        url: mr.url ?? mr.web_url,
        state: mr.state,
        createdAt: mr.createdAt ?? mr.created_at,
      });
      const label = isGitHub ? "Pull request" : "Merge request";
      const num = mr.number ?? mr.iid;
      toast({ title: `${label} ready`, description: `#${num}: ${mr.title}` });
      window.open(mr.url ?? mr.web_url, "_blank");
    } catch (err: unknown) {
      toast({
        title: isGitHub ? "PR failed" : "MR failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  }

  // ── Load commits ─────────────────────────────────────────────────────────
  async function loadCommits() {
    if (!project.github_repo || !isConnected) return;
    setLoading("commits");
    try {
      let res: Response;
      if (isGitHub) {
        res = await fetch(commitsEndpoint);
      } else {
        res = await fetch(commitsEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: project.id }),
        });
      }
      const data = await res.json();
      setCommits(Array.isArray(data) ? data : (data.commits ?? []));
    } finally {
      setLoading(null);
    }
  }

  // ── Build repo URL for external link ─────────────────────────────────────
  function repoUrl() {
    if (!project.github_repo) return "#";
    if (isGitLab) {
      // We stored "gitlab:<id>" — we can't easily reconstruct URL without namespace
      return "https://gitlab.com";
    }
    return `https://github.com/${project.github_repo}`;
  }

  // ── Derive display name for repo ─────────────────────────────────────────
  function repoDisplayName() {
    const raw = project.github_repo ?? "";
    if (raw.startsWith("gitlab:")) return `GitLab project #${raw.replace("gitlab:", "")}`;
    return raw;
  }

  const hasRepoForProvider =
    isGitHub
      ? !!project.github_repo && !(project.github_repo ?? "").startsWith("gitlab:")
      : !!(project.github_repo ?? "").startsWith("gitlab:");

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header + provider tabs */}
      <div className="flex flex-col gap-2 px-4 pt-3 pb-0 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          {isGitHub
            ? <Github className="w-4 h-4" />
            : <GitLabIcon className="w-4 h-4 text-orange-400" />}
          <span className="text-sm font-semibold">Git Sync</span>
          {isConnected && username && (
            <span className="text-xs text-muted-foreground ml-auto">@{username}</span>
          )}
        </div>

        {/* Provider toggle */}
        <div className="flex gap-1 pb-2">
          {(["github", "gitlab"] as GitProvider[]).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md transition-colors ${
                provider === p
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "github"
                ? <Github className="w-3 h-3" />
                : <GitLabIcon className="w-3 h-3 text-orange-400" />}
              {p === "github" ? "GitHub" : "GitLab"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Not connected */}
        {!isConnected && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-8"
          >
            <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center mx-auto mb-4">
              {isGitHub
                ? <Github className="w-8 h-8" />
                : <GitLabIcon className="w-8 h-8 text-orange-400" />}
            </div>
            <h3 className="font-semibold mb-2">
              Connect {isGitHub ? "GitHub" : "GitLab"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Link your {isGitHub ? "GitHub" : "GitLab"} account to push code, create repos, and enable two-way sync.
            </p>
            <Button onClick={connectProvider} className="gap-2">
              {isGitHub
                ? <Github className="w-4 h-4" />
                : <GitLabIcon className="w-4 h-4" />}
              Connect {isGitHub ? "GitHub" : "GitLab"}
            </Button>
          </motion.div>
        )}

        {/* Connected */}
        {isConnected && (
          <>
            <div className="p-4 rounded-xl bg-muted/30 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Repository</span>
                </div>
                <div className="flex items-center gap-2">
                  {hasRepoForProvider && (
                    <>
                      <button
                        onClick={loadBranchStatus}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Refresh status"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <a
                        href={repoUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </a>
                    </>
                  )}
                </div>
              </div>

              {hasRepoForProvider ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm font-mono truncate">{repoDisplayName()}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No repository connected yet.</p>
              )}

              {/* Branch + ahead/behind */}
              {displayBranch && hasRepoForProvider && (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                    <GitBranch className="w-3 h-3" />
                    <code className="font-mono">{displayBranch}</code>
                  </div>

                  {branchStatus && (branchStatus.ahead > 0 || branchStatus.behind > 0) && (
                    <div className="flex items-center gap-1">
                      {branchStatus.ahead > 0 && (
                        <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0.5 h-auto">
                          <ArrowUp className="w-2.5 h-2.5 text-green-500" />
                          {branchStatus.ahead}
                        </Badge>
                      )}
                      {branchStatus.behind > 0 && (
                        <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0.5 h-auto">
                          <ArrowDown className="w-2.5 h-2.5 text-amber-500" />
                          {branchStatus.behind}
                        </Badge>
                      )}
                    </div>
                  )}

                  {branchStatus?.diverged && (
                    <Badge variant="destructive" className="text-xs gap-1 px-1.5 py-0.5 h-auto">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Diverged
                    </Badge>
                  )}

                  {branchStatus && branchStatus.ahead === 0 && branchStatus.behind === 0 && !branchStatus.diverged && (
                    <span className="text-xs text-green-500">Up to date</span>
                  )}
                </div>
              )}

              {/* Open PR/MR indicator */}
              {openMR && (
                <a
                  href={openMR.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors"
                >
                  <GitMerge className="w-3 h-3" />
                  {isGitHub ? "PR" : "MR"} #{openMR.number ?? openMR.iid} open on {isGitHub ? "GitHub" : "GitLab"}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {!hasRepoForProvider ? (
                <Button
                  className="w-full gap-2"
                  onClick={() => syncAction("create")}
                  disabled={loading === "create"}
                >
                  {loading === "create" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create {isGitHub ? "GitHub" : "GitLab"} Repo
                </Button>
              ) : (
                <>
                  {/* Commit message */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-muted-foreground">Commit message</label>
                      <button
                        onClick={generateCommitMessage}
                        disabled={generatingMsg}
                        className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 disabled:opacity-50 transition-colors"
                        title="Generate with AI"
                      >
                        {generatingMsg
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Wand2 className="w-3 h-3" />}
                        Generate
                      </button>
                    </div>
                    <textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="feat(scope): describe your changes"
                      rows={2}
                      className="w-full resize-none rounded-md border border-border bg-muted/30 px-3 py-2 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => syncAction("push")}
                    disabled={!!loading}
                  >
                    {loading === "push" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Push to {isGitHub ? "GitHub" : "GitLab"}
                    {branchStatus && branchStatus.ahead > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">{branchStatus.ahead} ahead</Badge>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => syncAction("pull")}
                    disabled={!!loading}
                  >
                    {loading === "pull" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Pull from {isGitHub ? "GitHub" : "GitLab"}
                    {branchStatus && branchStatus.behind > 0 && (
                      <Badge variant="secondary" className="ml-auto text-xs">{branchStatus.behind} behind</Badge>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={openMRAction}
                    disabled={!!loading}
                  >
                    {loading === "mr" ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                    Open {isGitHub ? "Pull Request" : "Merge Request"}
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full gap-2 text-muted-foreground"
                    onClick={loadCommits}
                    disabled={loading === "commits"}
                  >
                    {loading === "commits" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                    View Commit History
                  </Button>
                </>
              )}
            </div>

            {/* Commit history */}
            {commits.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Recent Commits</h4>
                <div className="space-y-2">
                  {commits.map((commit) => (
                    <div key={commit.sha} className="p-3 rounded-lg bg-muted/30 border border-border">
                      <p className="text-xs font-medium truncate">{commit.message}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <code>{commit.sha.slice(0, 7)}</code>
                        <span>·</span>
                        <span>{commit.author}</span>
                        <span>·</span>
                        <span>{new Date(commit.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
