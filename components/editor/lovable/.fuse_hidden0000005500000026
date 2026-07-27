"use client";

import { GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableBranchChipProps {
  branchedAt?: string | null;
  snapshotId?: string | null;
  onOpenSnapshot?: (snapshotId: string) => void;
  className?: string;
}

/** Shows when a turn was created by editing/regenerating past a prior point. */
export function LovableBranchChip({
  branchedAt,
  snapshotId,
  onOpenSnapshot,
  className,
}: LovableBranchChipProps) {
  if (!branchedAt && !snapshotId) return null;
  const time = branchedAt
    ? new Date(branchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <button
      type="button"
      disabled={!snapshotId || !onOpenSnapshot}
      onClick={() => {
        if (snapshotId && onOpenSnapshot) onOpenSnapshot(snapshotId);
      }}
      title={
        snapshotId
          ? "Open the file snapshot taken before this branch"
          : "Branched from an earlier point in the conversation"
      }
      className={cn(
        "inline-flex items-center gap-1 self-end text-[10px] px-1.5 py-0.5 rounded-full",
        "border border-amber-500/30 bg-amber-500/10 text-amber-300/90",
        snapshotId && onOpenSnapshot && "hover:bg-amber-500/20 cursor-pointer",
        !snapshotId && "cursor-default",
        className,
      )}
    >
      <GitBranch className="size-2.5" />
      Branched{time ? ` · ${time}` : ""}
      {snapshotId ? " · snapshot" : ""}
    </button>
  );
}
