"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, Plus, RotateCcw, Trash2, Loader2,
  Clock, Camera, ImageOff,
  GitBranch, Pin, PinOff, GitCompareArrows,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface Snapshot {
  id: string;
  label: string;
  created_at: string;
  screenshot_url?: string | null;
  is_pinned?: boolean;
  pinned_at?: string | null;
}

interface HistoryPanelProps {
  projectId: string;
  onRestore: (files: ProjectFile[]) => void;
  /** Optional: open the diff viewer pre-populated with two snapshot ids */
  onCompare?: (oldSnapshotId: string, newSnapshotId: string) => void;
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

/** A single snapshot card with screenshot thumbnail */
function SnapshotCard({
  snap,
  restoring,
  deleting,
  togglingPin,
  canCompare,
  selectMode = false,
  isSelected = false,
  onRestore,
  onDelete,
  onTogglePin,
  onCompareToPrevious,
  onCardClick,
  isBranch = false,
}: {
  snap: Snapshot;
  restoring: boolean;
  deleting: boolean;
  togglingPin: boolean;
  canCompare: boolean;
  selectMode?: boolean;
  isSelected?: boolean;
  onRestore: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onCompareToPrevious: () => void;
  onCardClick?: () => void;
  isBranch?: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const hasThumb = !!snap.screenshot_url && !imgErr;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onClick={selectMode ? onCardClick : undefined}
      className={`group rounded-xl border ${isSelected ? "border-blue-500/60 ring-2 ring-blue-500/40" : snap.is_pinned ? "border-amber-500/40 ring-1 ring-amber-500/20" : "border-border"} ${isBranch ? "hover:border-emerald-500/30" : "hover:border-violet-500/30"} bg-card hover:bg-accent/30 overflow-hidden transition-all relative ${selectMode ? "cursor-pointer" : ""}`}
    >
      {snap.is_pinned && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/90 text-amber-950 text-[9px] font-semibold shadow-sm">
          <Pin className="w-2.5 h-2.5" />
          Pinned
        </div>
      )}
      {/* Screenshot thumbnail */}
      {hasThumb ? (
        <div
          className="w-full relative overflow-hidden bg-muted/30 border-b border-border/50"
          style={{ aspectRatio: "16/9" }}
        >
          <img
            src={snap.screenshot_url!}
            alt={snap.label}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
        </div>
      ) : (
        <div
          className="w-full flex items-center justify-center bg-muted/20 border-b border-border/40"
          style={{ aspectRatio: "16/9" }}
        >
          <div className="flex flex-col items-center gap-1 text-muted-foreground/30">
            <ImageOff className="w-5 h-5" />
            <span className="text-[9px]">No preview</span>
          </div>
        </div>
      )}

      {/* Info row */}
      <div className="flex items-center gap-2 px-2.5 py-2">
        {isBranch ? (
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <GitBranch className="w-2.5 h-2.5 text-emerald-400" />
          </div>
        ) : (
          <div className="w-4 h-4 rounded-full bg-violet-500/20 border border-violet-500/40 flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate leading-snug">
            {isBranch ? snap.label.replace("Before edit — ", "") : snap.label}
          </p>
          {isBranch && (
            <p className="text-[10px] text-emerald-400/80 flex items-center gap-1">
              <GitBranch className="w-2.5 h-2.5" />
              Branch checkpoint
            </p>
          )}
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-2.5 h-2.5" />
            {relativeTime(snap.created_at)}
          </p>
        </div>
        <div className={`flex items-center gap-1 shrink-0 transition-opacity ${snap.is_pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          {canCompare && (
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 text-muted-foreground hover:text-blue-400"
              onClick={onCompareToPrevious}
              title="Compare this snapshot with the next-newer one"
            >
              <GitCompareArrows className="w-3 h-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={`w-6 h-6 ${snap.is_pinned ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-amber-400"}`}
            onClick={onTogglePin}
            disabled={togglingPin}
            title={snap.is_pinned ? "Unpin snapshot" : "Pin as stable version"}
          >
            {togglingPin
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : snap.is_pinned
                ? <PinOff className="w-3 h-3" />
                : <Pin className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-violet-400"
            onClick={onRestore}
            disabled={restoring}
            title="Restore to this snapshot"
          >
            {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-6 h-6 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={deleting}
            title="Delete snapshot"
          >
            {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

export function HistoryPanel({ projectId, onRestore, onCompare }: HistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"snapshots" | "branches">("snapshots");
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [togglingPin, setTogglingPin] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [label, setLabel] = useState("");
  const [showInput, setShowInput] = useState(false);
  // Snapshot-pair selection mode — click two cards to pick a pair to compare.
  const [pairSelectMode, setPairSelectMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const { toast } = useToast();

  // Branches are snapshots auto-created before chat edits, prefixed with "Before edit — ".
  // Manual + AI-restore snapshots show in the Snapshots tab; pinned float to the top.
  const branchSnapshots = snapshots.filter((s) => s.label.startsWith("Before edit — "));
  const manualSnapshots = snapshots
    .filter((s) => !s.label.startsWith("Before edit — "))
    .sort((a, b) => {
      if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  // Split pinned from regular so the History tab can render a dedicated "Pinned" group.
  const pinnedSnapshots = manualSnapshots.filter((s) => s.is_pinned);
  const unpinnedSnapshots = manualSnapshots.filter((s) => !s.is_pinned);
  const displaySnapshots = activeTab === "branches" ? branchSnapshots : manualSnapshots;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/snapshots?projectId=${projectId}`);
      if (res.ok) {
        const data = await res.json() as Snapshot[];
        setSnapshots(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function createSnapshot() {
    if (!label.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, label: label.trim() }),
      });
      const data = await res.json() as Snapshot & { error?: string };
      if (!res.ok) {
        toast({ title: "Error", description: data.error ?? "Failed to create snapshot", variant: "destructive" });
        return;
      }
      setSnapshots((prev) => [data, ...prev]);
      setLabel("");
      setShowInput(false);
      toast({ title: "Snapshot saved", description: `"${data.label}" saved successfully.` });
    } finally {
      setCreating(false);
    }
  }

  async function restoreSnapshot(snap: Snapshot) {
    setRestoring(snap.id);
    try {
      // ── 1) Dry-run first — detect schema-changing files ─────────────────────
      const dryRes = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id, projectId, dryRun: true }),
      });
      const dry = await dryRes.json() as {
        ok: boolean;
        hasSchemaChanges?: boolean;
        schemaChanges?: { schemaPaths: string[]; addedTables: string[]; removedTables: string[] };
        error?: string;
      };

      let confirmSchema = false;
      if (dry?.hasSchemaChanges && dry.schemaChanges) {
        const { schemaPaths, addedTables, removedTables } = dry.schemaChanges;
        const lines = [
          "This restore would modify SQL schema files:",
          ...schemaPaths.slice(0, 6).map((p) => `  • ${p}`),
          schemaPaths.length > 6 ? `  • …and ${schemaPaths.length - 6} more` : "",
          "",
          removedTables.length > 0
            ? `Tables that would be REMOVED: ${removedTables.join(", ")}`
            : "",
          addedTables.length > 0
            ? `Tables that would be ADDED: ${addedTables.join(", ")}`
            : "",
          "",
          "Supabase does NOT revert cleanly. Make sure your database schema can handle this change.",
          "",
          "Continue with the restore?",
        ].filter(Boolean).join("\n");
        if (!window.confirm(lines)) {
          toast({ title: "Restore cancelled", description: "No changes were applied." });
          return;
        }
        confirmSchema = true;
      }

      // ── 2) Real restore ─────────────────────────────────────────────────────
      const res = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id, projectId, confirmSchema }),
      });
      const data = await res.json() as { ok: boolean; files: ProjectFile[]; message: string; error?: string };
      if (!res.ok) {
        toast({ title: "Restore failed", description: data.error, variant: "destructive" });
        return;
      }
      onRestore(data.files);
      toast({ title: "Restored!", description: data.message });
      void load();
    } finally {
      setRestoring(null);
    }
  }

  async function deleteSnapshot(snap: Snapshot) {
    setDeleting(snap.id);
    try {
      await fetch(`/api/projects/snapshots?id=${snap.id}`, { method: "DELETE" });
      setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
      toast({ title: "Snapshot deleted" });
    } finally {
      setDeleting(null);
    }
  }

  async function togglePin(snap: Snapshot) {
    const willPin = !snap.is_pinned;
    setTogglingPin(snap.id);
    // Optimistic update
    setSnapshots((prev) =>
      prev.map((s) =>
        s.id === snap.id
          ? { ...s, is_pinned: willPin, pinned_at: willPin ? new Date().toISOString() : null }
          : s
      )
    );
    try {
      const res = await fetch("/api/projects/snapshots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id, isPinned: willPin }),
      });
      if (!res.ok) {
        // Revert on failure
        setSnapshots((prev) =>
          prev.map((s) => (s.id === snap.id ? { ...s, is_pinned: !willPin } : s))
        );
        toast({ title: "Pin update failed", variant: "destructive" });
        return;
      }
      toast({
        title: willPin ? "Pinned as stable" : "Unpinned",
        description: willPin
          ? `"${snap.label}" stays at the top until unpinned.`
          : undefined,
      });
    } finally {
      setTogglingPin(null);
    }
  }

  /** Fire the compare flow for an arbitrary snapshot pair. */
  function fireCompare(olderId: string, newerId: string, olderLabel?: string, newerLabel?: string) {
    if (onCompare) {
      onCompare(olderId, newerId);
    } else {
      window.dispatchEvent(new CustomEvent("lifemark-open-diff", {
        detail: { oldSnapshotId: olderId, newSnapshotId: newerId },
      }));
      toast({
        title: "Opening diff…",
        description: olderLabel && newerLabel
          ? `Comparing "${olderLabel}" → "${newerLabel}"`
          : undefined,
      });
    }
  }

  async function compareLastTwo() {
    if (manualSnapshots.length < 2) {
      toast({ title: "Need at least 2 snapshots to compare", variant: "destructive" });
      return;
    }
    setComparing(true);
    try {
      const newer = manualSnapshots[0];
      const older = manualSnapshots[1];
      fireCompare(older.id, newer.id, older.label, newer.label);
    } finally {
      setComparing(false);
    }
  }

  /** Compare a single snapshot to the next-newer one (or to T-0 if it IS the newest). */
  function compareSnapshotToNewer(snap: Snapshot) {
    const all = activeTab === "branches" ? branchSnapshots : manualSnapshots;
    const idx = all.findIndex((s) => s.id === snap.id);
    if (idx <= 0) {
      const newest = manualSnapshots[0];
      if (!newest || newest.id === snap.id) {
        toast({ title: "No newer snapshot to compare against", variant: "destructive" });
        return;
      }
      fireCompare(snap.id, newest.id, snap.label, newest.label);
      return;
    }
    const newer = all[idx - 1];
    fireCompare(snap.id, newer.id, snap.label, newer.label);
  }

  /** Toggle a snapshot in/out of the compare-pair selection. */
  function togglePairSelect(snap: Snapshot) {
    setSelectedForCompare((prev) => {
      if (prev.includes(snap.id)) {
        return prev.filter((id) => id !== snap.id);
      }
      const next = [...prev, snap.id].slice(-2); // keep only the two most recent picks
      if (next.length === 2) {
        // Fire compare with older=first selected, newer=second
        // Order them by created_at so the diff makes chronological sense.
        const a = snapshots.find((s) => s.id === next[0]);
        const b = snapshots.find((s) => s.id === next[1]);
        if (a && b) {
          const [older, newer] = new Date(a.created_at).getTime() <= new Date(b.created_at).getTime()
            ? [a, b] : [b, a];
          // Defer so React processes the state update first
          setTimeout(() => {
            fireCompare(older.id, newer.id, older.label, newer.label);
            setPairSelectMode(false);
            setSelectedForCompare([]);
          }, 0);
        }
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Version History</span>
          {snapshots.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              {snapshots.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => void compareLastTwo()}
            disabled={comparing || manualSnapshots.length < 2}
            title="Compare the most recent two snapshots (T-1 → T-0)"
          >
            {comparing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCompareArrows className="w-3.5 h-3.5" />}
            Compare
          </Button>
          <Button
            variant={pairSelectMode ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => {
              setPairSelectMode((v) => !v);
              setSelectedForCompare([]);
            }}
            disabled={manualSnapshots.length < 2}
            title="Pick any two snapshots to compare"
          >
            {pairSelectMode ? "Cancel pick" : "Pick…"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowInput((v) => !v)}
          >
            <Camera className="w-3.5 h-3.5" />
            Snapshot
          </Button>
        </div>
      </div>

      {/* Pair-select hint banner */}
      {pairSelectMode && (
        <div className="px-3 py-2 border-b border-blue-500/20 bg-blue-500/[0.06] text-[11px] text-blue-200 flex items-center gap-2">
          <GitCompareArrows className="w-3 h-3" />
          <span className="flex-1">
            {selectedForCompare.length === 0
              ? "Click a snapshot to start picking, then click a second one to compare."
              : `Picked 1 of 2 — click another snapshot to compare.`}
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("snapshots")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === "snapshots"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Snapshots
          {manualSnapshots.length > 0 && (
            <span className="text-[10px] bg-muted rounded-full px-1.5">{manualSnapshots.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("branches")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2 ${
            activeTab === "branches"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <GitBranch className="w-3.5 h-3.5" />
          Branches
          {branchSnapshots.length > 0 && (
            <span className="text-[10px] bg-muted rounded-full px-1.5">{branchSnapshots.length}</span>
          )}
        </button>
      </div>

      {/* Snapshot label input */}
      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border"
          >
            <div className="p-3 flex gap-2">
              <Input
                placeholder="Label this snapshot…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createSnapshot()}
                className="h-8 text-sm flex-1"
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 px-3 text-xs bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90"
                onClick={createSnapshot}
                disabled={creating || !label.trim()}
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Snapshot / Branch list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="space-y-3 pt-1">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-border overflow-hidden animate-pulse">
                <div className="w-full bg-muted/40" style={{ aspectRatio: "16/9" }} />
                <div className="flex items-center gap-2 p-2.5">
                  <div className="w-4 h-4 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-2.5 bg-muted rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : displaySnapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {activeTab === "branches" ? (
              <>
                <GitBranch className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No branches yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  Edit a past message in the chat to create an alternate branch. Each edit is auto-saved here so you can always switch back.
                </p>
              </>
            ) : (
              <>
                <History className="w-8 h-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">No snapshots yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                  Click "Snapshot" to save the current state before making changes.
                </p>
                <p className="text-xs text-muted-foreground mt-2 opacity-60">
                  Snapshots auto-save before each AI restore.
                </p>
              </>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {activeTab === "snapshots" && pinnedSnapshots.length > 0 && (
              <>
                <div className="flex items-center gap-1.5 px-1 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                  <Pin className="w-2.5 h-2.5" />
                  Pinned ({pinnedSnapshots.length})
                </div>
                {pinnedSnapshots.map((snap, idx) => (
                  <SnapshotCard
                    key={snap.id}
                    snap={snap}
                    restoring={restoring === snap.id}
                    deleting={deleting === snap.id}
                    togglingPin={togglingPin === snap.id}
                    canCompare={manualSnapshots.length > 1 && manualSnapshots.findIndex((s) => s.id === snap.id) < manualSnapshots.length - 1}
                    onRestore={() => void restoreSnapshot(snap)}
                    onDelete={() => void deleteSnapshot(snap)}
                    onTogglePin={() => void togglePin(snap)}
                    onCompareToPrevious={() => compareSnapshotToNewer(snap)}
                selectMode={pairSelectMode}
                isSelected={selectedForCompare.includes(snap.id)}
                onCardClick={() => togglePairSelect(snap)}
                    isBranch={false}
                  />
                ))}
                {unpinnedSnapshots.length > 0 && (
                  <div className="flex items-center gap-1.5 px-1 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    <History className="w-2.5 h-2.5" />
                    All snapshots
                  </div>
                )}
                {unpinnedSnapshots.map((snap, idx) => (
                  <SnapshotCard
                    key={snap.id}
                    snap={snap}
                    restoring={restoring === snap.id}
                    deleting={deleting === snap.id}
                    togglingPin={togglingPin === snap.id}
                    canCompare={manualSnapshots.length > 1 && manualSnapshots.findIndex((s) => s.id === snap.id) < manualSnapshots.length - 1}
                    onRestore={() => void restoreSnapshot(snap)}
                    onDelete={() => void deleteSnapshot(snap)}
                    onTogglePin={() => void togglePin(snap)}
                    onCompareToPrevious={() => compareSnapshotToNewer(snap)}
                selectMode={pairSelectMode}
                isSelected={selectedForCompare.includes(snap.id)}
                onCardClick={() => togglePairSelect(snap)}
                    isBranch={false}
                  />
                ))}
              </>
            )}
            {(activeTab === "branches" || pinnedSnapshots.length === 0) && displaySnapshots.map((snap, idx) => (
              <SnapshotCard
                key={snap.id}
                snap={snap}
                restoring={restoring === snap.id}
                deleting={deleting === snap.id}
                togglingPin={togglingPin === snap.id}
                canCompare={displaySnapshots.length > 1 && idx < displaySnapshots.length - 1}
                onRestore={() => void restoreSnapshot(snap)}
                onDelete={() => void deleteSnapshot(snap)}
                onTogglePin={() => void togglePin(snap)}
                onCompareToPrevious={() => compareSnapshotToNewer(snap)}
                selectMode={pairSelectMode}
                isSelected={selectedForCompare.includes(snap.id)}
                onCardClick={() => togglePairSelect(snap)}
                isBranch={activeTab === "branches"}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {snapshots.length > 0 && (
        <div className="px-4 py-2 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Sparkles className="w-2.5 h-2.5" />
            Pin stable versions • Compare to spot what broke • Hover to restore
          </p>
        </div>
      )}
    </div>
  );
}
