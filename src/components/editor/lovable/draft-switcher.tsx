import { useEffect,useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check,ChevronDown,GitBranch,Loader2,Plus } from "lucide-react";
import {
DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface DraftSummary {
  id: string;
  name: string;
  label: string;
  isRoot: boolean;
  isCurrent: boolean;
  createdAt: string;
}

/**
 * Lovable parity: "multiple independent drafts/branches per project each
 * with its own chat history." Each entry here is a genuinely separate
 * project (own files, own chat, own preview) linked back to where it was
 * branched from — see migration 180 / drafts.ts. Self-contained: fetches its
 * own list, so it doesn't add to chat-header.tsx's already-large prop
 * surface.
 */
export function LovableDraftSwitcher({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    void fetch(`/api/projects/${projectId}/drafts`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Failed to load drafts (${res.status})`))))
      .then((data: { drafts?: DraftSummary[] }) => {
        if (!cancelled) setDrafts(data.drafts ?? []);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const current = drafts?.find((d) => d.isCurrent);

  async function createDraft() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/drafts`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { draft?: { id: string }; error?: string };
      if (!res.ok || !data.draft) {
        throw new Error(data.error ?? `Failed to create draft (${res.status})`);
      }
      setOpen(false);
      await navigate({ to: "/editor/$projectId", params: { projectId: data.draft.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create draft");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--glow-neutral-hover)] transition-colors"
          title="Drafts — try a different direction without losing this one"
        >
          <GitBranch className="size-3.5" />
          <span className="hidden sm:inline max-w-[9rem] truncate">{current?.label ?? "Drafts"}</span>
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-1">
        {drafts === null && !error && (
          <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading drafts…
          </div>
        )}
        {error && (
          <div className="px-2 py-2 text-xs text-destructive">{error}</div>
        )}
        {drafts && drafts.length > 0 && (
          <>
            {drafts.map((d) => (
              <DropdownMenuItem
                key={d.id}
                className="text-xs gap-2"
                disabled={d.isCurrent}
                onClick={() => {
                  if (d.isCurrent) return;
                  setOpen(false);
                  void navigate({ to: "/editor/$projectId", params: { projectId: d.id } });
                }}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full shrink-0",
                    d.isRoot ? "bg-blue-500" : "bg-violet-500",
                  )}
                />
                <span className="flex-1 truncate">{d.label}</span>
                {d.isCurrent && <Check className="size-3.5 text-violet-500" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem className="text-xs gap-2" disabled={creating} onClick={() => void createDraft()}>
          {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          <span className="flex-1">New draft from here</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
