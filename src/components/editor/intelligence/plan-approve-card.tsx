/**
 * Plan-before-build UX: show epics/tasks and require explicit approve
 * before the orchestrator executes waves (Lovable Plan mode parity).
 */
import { useState } from "react";

export interface PlanTaskPreview {
  id: string;
  title: string;
  role?: string;
  risk?: number;
}

export interface PlanEpicPreview {
  title: string;
  tasks: PlanTaskPreview[];
}

export function PlanApproveCard({
  goal,
  epics,
  onApprove,
  onRevise,
  busy,
}: {
  goal: string;
  epics: PlanEpicPreview[];
  onApprove: () => void;
  onRevise?: (note: string) => void;
  busy?: boolean;
}) {
  const [note, setNote] = useState("");
  const taskCount = epics.reduce((n, e) => n + e.tasks.length, 0);
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Plan · review before build
        </h4>
        <span className="text-[10px] text-muted-foreground">
          {epics.length} epics · {taskCount} tasks
        </span>
      </div>
      <p className="mb-2 line-clamp-2 text-xs text-foreground/90">{goal}</p>
      <ul className="mb-3 max-h-40 space-y-2 overflow-y-auto">
        {epics.map((e, i) => (
          <li key={i} className="rounded border border-border/60 bg-muted/20 px-2 py-1.5">
            <div className="text-xs font-medium">{e.title}</div>
            <ul className="mt-1 space-y-0.5 pl-2">
              {e.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="truncate">{t.title}</span>
                  {t.role && <span className="shrink-0 opacity-70">{t.role}</span>}
                  {typeof t.risk === "number" && (
                    <span className="shrink-0 tabular-nums">r{t.risk}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {onRevise && (
        <input
          className="mb-2 w-full rounded border border-border bg-background px-2 py-1 text-xs"
          placeholder="Revision note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
        />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
          onClick={onApprove}
          disabled={busy}
        >
          Approve & build
        </button>
        {onRevise && (
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1.5 text-xs disabled:opacity-50"
            onClick={() => onRevise(note)}
            disabled={busy || !note.trim()}
          >
            Revise plan
          </button>
        )}
      </div>
    </div>
  );
}
