
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  History, Plus, RotateCcw, Trash2, Loader2,
  Clock, Camera, Eye,
  GitBranch, Pin, PinOff, GitCompareArrows,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { formatRelative } from "@/lib/utils";
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

type HistoryFilter = "all" | "pinned" | "branches";

/** Strip auto-prefix noise so the row reads like Lovable change titles. */
function displayLabel(label: string): string {
  return label
    .replace(/^Before edit —\s*/i, "")
    .replace(/^Auto-save before:\s*/i, "")
    .replace(/^Before:\s*/i, "")
    .replace(/^Snapshot\s+/i, "")
    .trim() || "Untitled change";
}

function isBranchSnapshot(snap: Snapshot): boolean {
  return snap.label.startsWith("Before edit — ");
}

function isAutoChange(snap: Snapshot): boolean {
  return (
    /^(Before:|Auto-save before:|Before edit —)/i.test(snap.label) ||
    /^(Deploy|Publish) snapshot/i.test(snap.label)
  );
}

/** Absolute clock for the row — Lovable shows both relative + time. */
function formatClock(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function dayGroupLabel(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function groupByDay(snaps: Snapshot[]): { label: string; items: Snapshot[] }[] {
  const groups: { label: string; items: Snapshot[] }[] = [];
  const index = new Map<string, number>();
  for (const snap of snaps) {
    const label = dayGroupLabel(snap.created_at);
    const existing = index.get(label);
    if (existing == null) {
      index.set(label, groups.length);
      groups.push({ label, items: [snap] });
    } else {
      groups[existing]!.items.push(snap);
    }
  }
  return groups;
}

/** Compact Lovable-style change row (not a heavy 16:9 card). */
function ChangeRow({
  snap,
  isLatest,
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
  onPreview,
  onCardClick,
}: {
  snap: Snapshot;
  isLatest: boolean;
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
  onPreview: () => void;
  onCardClick?: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);
  const branch = isBranchSnapshot(snap);
  const title = displayLabel(snap.label);
  const hasThumb = !!snap.screenshot_url && !imgErr;
  const relative = formatRelative(snap.created_at);
  const clock = formatClock(snap.created_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12 }}
      onClick={selectMode ? onCardClick : undefined}
      className={[
        "group flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        isSelected
          ? "border-blue-500/60 bg-blue-500/10 ring-1 ring-blue-500/30"
          : snap.is_pinned
            ? "border-amber-500/35 bg-amber-500/[0.04]"
            : "border-border/80 bg-card/40 hover:bg-accent/40",
        selectMode ? "cursor-pointer" : "",
      ].join(" ")}
    >
      {/* Tiny thumb or icon */}
      <div className="relative mt-0.5 h-10 w-14 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40">
        {hasThumb ? (
          <img
            src={snap.screenshot_url!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            {branch ? <GitBranch className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
          </div>
        )}
        {isLatest && (
          <span className="absolute bottom-0.5 left-0.5 rounded bg-emerald-500/90 px-1 text-[8px] font-semibold text-white">
            Now
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium leading-snug text-foreground">
            {title}
          </p>
          <div className="shrink-0 text-right leading-tight">
            <p className="text-[11px] font-medium text-muted-foreground tabular-nums">
              {relative}
            </p>
            <p className="text-[10px] text-muted-foreground/70 tabular-nums flex items-center justify-end gap-0.5">
              <Clock className="h-2.5 w-2.5" />
              {clock}
            </p>
          </div>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {snap.is_pinned && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-600 dark:text-amber-400">
              <Pin className="h-2.5 w-2.5" />
              Pinned
            </span>
          )}
          {branch && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400">
              <GitBranch className="h-2.5 w-2.5" />
              Branch
            </span>
          )}
          {isAutoChange(snap) && !branch && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
              Auto
            </span>
          )}
        </div>

        {/* Actions — always visible on touch; hover-reveal on desktop */}
        {!selectMode && (
          <div className="mt-2 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); onPreview(); }}
              title="Preview this version"
            >
              <Eye className="h-3 w-3" />
              Preview
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-violet-400"
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              disabled={restoring}
              title="Restore to this version"
            >
              {restoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Restore
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${snap.is_pinned ? "text-amber-400" : "text-muted-foreground hover:text-amber-400"}`}
              onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
              disabled={togglingPin}
              title={snap.is_pinned ? "Unpin" : "Pin as stable"}
            >
              {togglingPin
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : snap.is_pinned
                  ? <PinOff className="h-3 w-3" />
                  : <Pin className="h-3 w-3" />}
            </Button>
            {canCompare && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-blue-400"
                onClick={(e) => { e.stopPropagation(); onCompareToPrevious(); }}
                title="Compare with newer version"
              >
                <GitCompareArrows className="h-3 w-3" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={deleting}
              title="Delete"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function HistoryPanel({ projectId, onRestore, onCompare }: HistoryPanelProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [togglingPin, setTogglingPin] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [label, setLabel] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [pairSelectMode, setPairSelectMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const { toast } = useToast();

  const sorted = useMemo(
    () =>
      [...snapshots].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [snapshots],
  );

  const filtered = useMemo(() => {
    if (filter === "pinned") return sorted.filter((s) => s.is_pinned);
    if (filter === "branches") return sorted.filter(isBranchSnapshot);
    // All: pinned float to top within their day group via separate pinned strip
    return sorted;
  }, [sorted, filter]);

  const pinned = useMemo(() => sorted.filter((s) => s.is_pinned), [sorted]);
  const dayGroups = useMemo(() => groupByDay(filtered), [filtered]);
  const latestId = sorted[0]?.id ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/snapshots?projectId=${projectId}`);
      if (res.ok) {
        const data = (await res.json()) as Snapshot[];
        setSnapshots(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createSnapshot() {
    if (!label.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, label: label.trim() }),
      });
      const data = (await res.json()) as Snapshot & { error?: string };
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
      const dryRes = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id, projectId, dryRun: true }),
      });
      const dry = (await dryRes.json()) as {
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
          removedTables.length > 0 ? `Tables that would be REMOVED: ${removedTables.join(", ")}` : "",
          addedTables.length > 0 ? `Tables that would be ADDED: ${addedTables.join(", ")}` : "",
          "",
          "Continue with the restore?",
        ]
          .filter(Boolean)
          .join("\n");
        if (!window.confirm(lines)) {
          toast({ title: "Restore cancelled", description: "No changes were applied." });
          return;
        }
        confirmSchema = true;
      }

      const res = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id, projectId, confirmSchema }),
      });
      const data = (await res.json()) as { ok: boolean; files: ProjectFile[]; message: string; error?: string };
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
      // Two layers each used to guarantee a success signal for a failed
      // delete: the server discarded its `{ error }`, and this ignored the
      // response and removed the row optimistically. The version vanished
      // from the list and reappeared on reload.
      const res = await fetch(`/api/projects/snapshots?id=${snap.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast({
          title: "Version was not deleted",
          description: body.error ?? `The server rejected the delete (${res.status}).`,
          variant: "destructive",
        });
        return;
      }
      setSnapshots((prev) => prev.filter((s) => s.id !== snap.id));
      toast({ title: "Version deleted" });
    } catch {
      toast({
        title: "Version was not deleted",
        description: "You appear to be offline. Try again once you reconnect.",
        variant: "destructive",
      });
    } finally {
      setDeleting(null);
    }
  }

  async function togglePin(snap: Snapshot) {
    const willPin = !snap.is_pinned;
    setTogglingPin(snap.id);
    setSnapshots((prev) =>
      prev.map((s) =>
        s.id === snap.id
          ? { ...s, is_pinned: willPin, pinned_at: willPin ? new Date().toISOString() : null }
          : s,
      ),
    );
    try {
      const res = await fetch("/api/projects/snapshots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snap.id, isPinned: willPin }),
      });
      if (!res.ok) {
        setSnapshots((prev) =>
          prev.map((s) => (s.id === snap.id ? { ...s, is_pinned: !willPin } : s)),
        );
        toast({ title: "Pin update failed", variant: "destructive" });
        return;
      }
      toast({
        title: willPin ? "Pinned as stable" : "Unpinned",
        description: willPin ? `"${displayLabel(snap.label)}" stays easy to find.` : undefined,
      });
    } finally {
      setTogglingPin(null);
    }
  }

  function previewSnapshot(snap: Snapshot) {
    window.dispatchEvent(
      new CustomEvent("lifemark-preview-version", {
        detail: { snapshotId: snap.id, label: displayLabel(snap.label) },
      }),
    );
    toast({
      title: "Previewing version",
      description: `${displayLabel(snap.label)} · ${formatRelative(snap.created_at)}`,
    });
  }

  function fireCompare(olderId: string, newerId: string, olderLabel?: string, newerLabel?: string) {
    if (onCompare) {
      onCompare(olderId, newerId);
    } else {
      window.dispatchEvent(
        new CustomEvent("lifemark-open-diff", {
          detail: { oldSnapshotId: olderId, newSnapshotId: newerId },
        }),
      );
      toast({
        title: "Opening diff…",
        description:
          olderLabel && newerLabel
            ? `Comparing "${displayLabel(olderLabel)}" → "${displayLabel(newerLabel)}"`
            : undefined,
      });
    }
  }

  async function compareLastTwo() {
    if (sorted.length < 2) {
      toast({ title: "Need at least 2 versions to compare", variant: "destructive" });
      return;
    }
    setComparing(true);
    try {
      const newer = sorted[0]!;
      const older = sorted[1]!;
      fireCompare(older.id, newer.id, older.label, newer.label);
    } finally {
      setComparing(false);
    }
  }

  function compareSnapshotToNewer(snap: Snapshot) {
    const idx = sorted.findIndex((s) => s.id === snap.id);
    if (idx <= 0) {
      toast({ title: "No newer version to compare against", variant: "destructive" });
      return;
    }
    const newer = sorted[idx - 1]!;
    fireCompare(snap.id, newer.id, snap.label, newer.label);
  }

  function togglePairSelect(snap: Snapshot) {
    setSelectedForCompare((prev) => {
      if (prev.includes(snap.id)) return prev.filter((id) => id !== snap.id);
      const next = [...prev, snap.id].slice(-2);
      if (next.length === 2) {
        const a = snapshots.find((s) => s.id === next[0]);
        const b = snapshots.find((s) => s.id === next[1]);
        if (a && b) {
          const [older, newer] =
            new Date(a.created_at).getTime() <= new Date(b.created_at).getTime() ? [a, b] : [b, a];
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

  const branchCount = sorted.filter(isBranchSnapshot).length;
  const pinnedCount = pinned.length;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Change history</span>
          {snapshots.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">
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
            disabled={comparing || sorted.length < 2}
            title="Compare the two most recent versions"
          >
            {comparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompareArrows className="h-3.5 w-3.5" />}
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
            disabled={sorted.length < 2}
          >
            {pairSelectMode ? "Cancel" : "Pick…"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowInput((v) => !v)}
          >
            <Camera className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>

      {pairSelectMode && (
        <div className="flex items-center gap-2 border-b border-blue-500/20 bg-blue-500/[0.06] px-3 py-2 text-[11px] text-blue-800 dark:text-blue-200">
          <GitCompareArrows className="h-3 w-3" />
          <span className="flex-1">
            {selectedForCompare.length === 0
              ? "Click a version, then another to compare."
              : "Picked 1 of 2 — click another version."}
          </span>
        </div>
      )}

      {/* Lovable-style filter chips */}
      <div className="flex shrink-0 gap-1.5 border-b border-border px-3 py-2">
        {(
          [
            { id: "all" as const, label: "All", count: sorted.length },
            { id: "pinned" as const, label: "Pinned", count: pinnedCount },
            { id: "branches" as const, label: "Branches", count: branchCount },
          ] as const
        ).map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={[
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              filter === chip.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {chip.id === "pinned" && <Pin className="h-2.5 w-2.5" />}
            {chip.id === "branches" && <GitBranch className="h-2.5 w-2.5" />}
            {chip.label}
            {chip.count > 0 && (
              <span className="tabular-nums opacity-80">{chip.count}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showInput && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border"
          >
            <div className="flex gap-2 p-3">
              <Input
                placeholder="Label this version…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createSnapshot()}
                className="h-8 flex-1 text-sm"
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => void createSnapshot()}
                disabled={creating || !label.trim()}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chronological list */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="space-y-2 pt-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex animate-pulse gap-3 rounded-lg border border-border/60 p-2.5">
                <div className="h-10 w-14 shrink-0 rounded-md bg-muted" />
                <div className="flex-1 space-y-2 py-0.5">
                  <div className="h-3 w-3/4 rounded bg-muted" />
                  <div className="h-2.5 w-1/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            {filter === "branches" ? (
              <>
                <GitBranch className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No branches yet</p>
                <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                  Edit a past chat message to create a branch. Each edit is saved here with a timestamp.
                </p>
              </>
            ) : filter === "pinned" ? (
              <>
                <Pin className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No pinned versions</p>
                <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                  Pin a stable build so you can find it quickly.
                </p>
              </>
            ) : (
              <>
                <History className="mb-3 h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No changes yet</p>
                <p className="mt-1 max-w-[220px] text-xs text-muted-foreground">
                  Versions appear automatically before each AI edit, with time — like Lovable.
                </p>
              </>
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {filter === "all" && pinned.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">
                  <Pin className="h-2.5 w-2.5" />
                  Pinned
                </div>
                {pinned.map((snap) => (
                  <ChangeRow
                    key={`pin-${snap.id}`}
                    snap={snap}
                    isLatest={snap.id === latestId}
                    restoring={restoring === snap.id}
                    deleting={deleting === snap.id}
                    togglingPin={togglingPin === snap.id}
                    canCompare={sorted.length > 1}
                    selectMode={pairSelectMode}
                    isSelected={selectedForCompare.includes(snap.id)}
                    onRestore={() => void restoreSnapshot(snap)}
                    onDelete={() => void deleteSnapshot(snap)}
                    onTogglePin={() => void togglePin(snap)}
                    onCompareToPrevious={() => compareSnapshotToNewer(snap)}
                    onPreview={() => previewSnapshot(snap)}
                    onCardClick={() => togglePairSelect(snap)}
                  />
                ))}
              </div>
            )}

            {dayGroups.map((group) => (
              <div key={group.label} className="space-y-2">
                <div className="sticky top-0 z-[1] -mx-1 bg-background/95 px-1 py-1 backdrop-blur-sm">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    {group.label}
                  </p>
                </div>
                {group.items
                  .filter((s) => !(filter === "all" && s.is_pinned))
                  .map((snap) => (
                    <ChangeRow
                      key={snap.id}
                      snap={snap}
                      isLatest={snap.id === latestId}
                      restoring={restoring === snap.id}
                      deleting={deleting === snap.id}
                      togglingPin={togglingPin === snap.id}
                      canCompare={sorted.length > 1 && snap.id !== latestId}
                      selectMode={pairSelectMode}
                      isSelected={selectedForCompare.includes(snap.id)}
                      onRestore={() => void restoreSnapshot(snap)}
                      onDelete={() => void deleteSnapshot(snap)}
                      onTogglePin={() => void togglePin(snap)}
                      onCompareToPrevious={() => compareSnapshotToNewer(snap)}
                      onPreview={() => previewSnapshot(snap)}
                      onCardClick={() => togglePairSelect(snap)}
                    />
                  ))}
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {snapshots.length > 0 && (
        <div className="shrink-0 border-t border-border px-4 py-2">
          <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground">
            <Sparkles className="h-2.5 w-2.5" />
            Each change is saved with time · Preview · Restore · Pin
          </p>
        </div>
      )}
    </div>
  );
}
