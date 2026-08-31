import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { GitFork,Loader2,Database,MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,
} from "@/components/ui/dialog";

interface RemixButtonProps {
  projectId: string;
  remixCount?: number;
}

interface DryRunInfo {
  sourceName: string;
  fileCount: number;
  hasSupabase: boolean;
  messageCount: number;
  messageCountTruncated: boolean;
}

/**
 * Remix — hits proxied /api/projects/:id/remix.
 *
 * Used to remix on a single click, with no confirmation and no way to see
 * (or act on) what the dry-run check already knew: whether the source
 * project has Supabase wired in (so its keys shouldn't just be copied
 * verbatim into a new owner's project) and how much chat history exists.
 * Now surfaces both before committing, and lets the user carry the chat
 * history over — matching Lovable's remix confirmation, and finally
 * giving the Supabase-disconnect option (already built server-side) a way
 * to actually be turned on.
 */
export function RemixButton({ projectId, remixCount = 0 }: RemixButtonProps) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [remixing, setRemixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<DryRunInfo | null>(null);
  const [disconnectSupabase, setDisconnectSupabase] = useState(true);
  const [carryOverChatHistory, setCarryOverChatHistory] = useState(false);

  async function openDialog() {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        void navigate({ to: "/login", search: { next: typeof window !== "undefined" ? window.location.pathname : "/explore" } });
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? "Failed to remix");
      setInfo({
        sourceName: data.sourceName ?? "this project",
        fileCount: data.fileCount ?? 0,
        hasSupabase: !!data.hasSupabase,
        messageCount: data.messageCount ?? 0,
        messageCountTruncated: !!data.messageCountTruncated,
      });
      setDisconnectSupabase(!!data.hasSupabase);
      setCarryOverChatHistory(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remix failed");
    } finally {
      setChecking(false);
    }
  }

  async function confirmRemix() {
    if (remixing) return;
    setRemixing(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disconnectSupabase: info?.hasSupabase ? disconnectSupabase : false,
          carryOverChatHistory,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to remix");
      if (data?.id) {
        void navigate({ to: "/editor/$projectId", params: { projectId: data.id as string } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remix failed");
      setRemixing(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void openDialog()} disabled={checking}>
        {checking ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <GitFork className="h-4 w-4 mr-1.5" />}
        Remix
        {remixCount > 0 && <span className="ml-1 text-xs opacity-80">{remixCount}</span>}
      </Button>
      {/* Only the pre-dialog (openDialog) failure renders here — once the
          dialog is open, its own error block below is what's visible; a
          sibling span here sits behind the dialog's portal/overlay. */}
      {error && !info && <span className="text-[10px] text-red-500 max-w-[200px] text-right">{error}</span>}

      <Dialog open={!!info} onOpenChange={(open) => { if (!open && !remixing) setInfo(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remix {info?.sourceName}</DialogTitle>
            <DialogDescription>
              This creates your own copy — {info?.fileCount ?? 0} file{info?.fileCount === 1 ? "" : "s"} — that you can edit freely. The original project is unaffected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {info?.hasSupabase && (
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <Database className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Disconnect Supabase</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    This project has Supabase wired in. Its keys point at the original owner&apos;s database — leave this on unless you&apos;re connecting your own.
                  </p>
                </div>
                <Switch checked={disconnectSupabase} onCheckedChange={setDisconnectSupabase} className="mt-0.5" />
              </div>
            )}

            {(info?.messageCount ?? 0) > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Carry over chat history</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bring the {info?.messageCountTruncated ? "first " : ""}{info?.messageCount} message{info?.messageCount === 1 ? "" : "s"} that built this project into your remix, so the AI has that context to keep building from.
                  </p>
                </div>
                <Switch checked={carryOverChatHistory} onCheckedChange={setCarryOverChatHistory} className="mt-0.5" />
              </div>
            )}

            {error && info && (
              <p className="text-xs text-red-500">{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setInfo(null)} disabled={remixing}>
              Cancel
            </Button>
            <Button onClick={() => void confirmRemix()} disabled={remixing} className="gap-1.5">
              {remixing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitFork className="w-3.5 h-3.5" />}
              {remixing ? "Remixing…" : "Remix project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
