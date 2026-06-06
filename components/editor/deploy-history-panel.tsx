"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket, RefreshCw, ExternalLink, RotateCcw,
  CheckCircle2, XCircle, Clock, Loader2, Globe,
  AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { Project } from "@/types/database";

interface DeployRecord {
  id: string;
  status: "building" | "live" | "failed" | "cancelled";
  url: string | null;
  provider: string;
  snapshot_id: string | null;
  file_count: number | null;
  commit_sha: string | null;
  deployed_at: string | null;
  created_at: string;
}

interface DeployHistoryPanelProps {
  project: Project;
  onFilesRefresh?: () => void;
}

const STATUS_CONFIG = {
  live:      { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Live" },
  building:  { icon: Loader2,      color: "text-blue-400",    bg: "bg-blue-500/10",    label: "Building" },
  failed:    { icon: XCircle,      color: "text-red-400",     bg: "bg-red-500/10",     label: "Failed" },
  cancelled: { icon: AlertTriangle, color: "text-amber-400",  bg: "bg-amber-500/10",   label: "Cancelled" },
} satisfies Record<string, { icon: React.ElementType; color: string; bg: string; label: string }>;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DeployHistoryPanel({ project, onFilesRefresh }: DeployHistoryPanelProps) {
  const [deploys, setDeploys] = useState<DeployRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [rollingBack, setRollingBack] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();
  const confirm = useConfirm();

  const loadDeploys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deploy?projectId=${project.id}`);
      if (res.ok) setDeploys(await res.json());
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { loadDeploys(); }, [loadDeploys]);

  // Auto-poll while a deploy is building
  useEffect(() => {
    const hasBuilding = deploys.some((d) => d.status === "building");
    if (!hasBuilding) return;
    const timer = setInterval(loadDeploys, 5000);
    return () => clearInterval(timer);
  }, [deploys, loadDeploys]);

  async function deploy() {
    setDeploying(true);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, provider: "netlify" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Deploy started!", description: data.message ?? "Deployment queued." });
      await loadDeploys();
    } catch (err) {
      toast({ title: "Deploy failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setDeploying(false);
    }
  }

  async function rollback(deployId: string) {
    const ok = await confirm({
      title: "Restore this snapshot?",
      description: "This will overwrite your current project files with this deploy's snapshot. Unsaved changes will be lost.",
      confirmLabel: "Restore",
      variant: "destructive",
    });
    if (!ok) return;
    setRollingBack(deployId);
    try {
      const res = await fetch("/api/deploy/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, deploymentId: deployId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Rolled back!", description: `Restored ${data.fileCount} files.` });
      onFilesRefresh?.();
    } catch (err) {
      toast({ title: "Rollback failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setRollingBack(null);
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Rocket className="w-4 h-4" />
        <span className="text-sm font-semibold">Deploy History</span>
        <button onClick={loadDeploys} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Current live URL */}
        {project.deployed_url && (
          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            <a
              href={project.deployed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-emerald-400 hover:underline truncate flex-1 font-mono"
            >
              {project.deployed_url}
            </a>
            <ExternalLink className="w-3 h-3 text-emerald-400/60 shrink-0" />
          </div>
        )}

        {/* Deploy button */}
        <Button
          className="w-full gap-2"
          onClick={deploy}
          disabled={deploying}
        >
          {deploying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
          {deploying ? "Deploying…" : "Deploy now"}
        </Button>

        {/* Deploy list */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Deploy History
          </h4>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : deploys.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Rocket className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>No deploys yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {deploys.map((deploy, idx) => {
                const S = STATUS_CONFIG[deploy.status] ?? STATUS_CONFIG.building;
                const isExpanded = expandedId === deploy.id;
                const isRollingBack = rollingBack === deploy.id;
                const isLatest = idx === 0;

                return (
                  <motion.div
                    key={deploy.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="rounded-xl border border-border bg-card overflow-hidden"
                  >
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-accent/30 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : deploy.id)}
                    >
                      {/* Status icon */}
                      <div className={`w-7 h-7 rounded-lg ${S.bg} flex items-center justify-center shrink-0`}>
                        <S.icon className={`w-3.5 h-3.5 ${S.color} ${deploy.status === "building" ? "animate-spin" : ""}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${S.color}`}>{S.label}</span>
                          {isLatest && deploy.status === "live" && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Clock className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">{timeAgo(deploy.created_at)}</span>
                          {deploy.file_count != null && (
                            <span className="text-xs text-muted-foreground">· {deploy.file_count} files</span>
                          )}
                        </div>
                      </div>

                      <button className="text-muted-foreground shrink-0">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-2 border-t border-border pt-3">
                            {/* URL */}
                            {deploy.url && (
                              <a
                                href={deploy.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs text-blue-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="truncate font-mono">{deploy.url}</span>
                              </a>
                            )}

                            {/* Provider */}
                            <p className="text-xs text-muted-foreground capitalize">
                              Provider: {deploy.provider}
                            </p>

                            {/* Deployed at */}
                            {deploy.deployed_at && (
                              <p className="text-xs text-muted-foreground">
                                Deployed: {new Date(deploy.deployed_at).toLocaleString()}
                              </p>
                            )}

                            {/* Rollback button */}
                            {deploy.snapshot_id && !isLatest && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full gap-2 mt-2 text-xs h-8"
                                onClick={(e) => { e.stopPropagation(); rollback(deploy.id); }}
                                disabled={isRollingBack}
                              >
                                {isRollingBack
                                  ? <Loader2 className="w-3 h-3 animate-spin" />
                                  : <RotateCcw className="w-3 h-3" />}
                                {isRollingBack ? "Rolling back…" : "Rollback to this deploy"}
                              </Button>
                            )}

                            {!deploy.snapshot_id && (
                              <p className="text-xs text-muted-foreground italic">
                                No snapshot — rollback unavailable for this deploy.
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
