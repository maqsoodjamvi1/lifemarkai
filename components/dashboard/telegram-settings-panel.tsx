"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ExternalLink, Unlink, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

interface TelegramStatus {
  linked: boolean;
  linkedAt: string | null;
  botUsername: string;
}

export function TelegramSettingsPanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deepLink, setDeepLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/telegram/link");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate link");
      setDeepLink(data.deepLink as string);
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
      toast({
        title: "Open Telegram",
        description: "Tap Start in the bot chat to finish linking.",
      });
    } catch (err) {
      toast({
        title: "Couldn't connect",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations/telegram/link", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to unlink");
      }
      setDeepLink(null);
      await load();
      toast({ title: "Telegram unlinked" });
    } catch (err) {
      toast({
        title: "Couldn't unlink",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-lg flex items-center gap-2">
          <Send className="w-5 h-5 text-sky-400" />
          Telegram
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Get build-complete and deploy alerts in Telegram — same flow as Lovable&apos;s bot notifications.
        </p>
      </div>

      {status?.linked ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
          <p className="text-sm font-medium text-emerald-300">Connected</p>
          <p className="text-xs text-muted-foreground">
            Linked {status.linkedAt ? formatDate(status.linkedAt) : "recently"} via @{status.botUsername}
          </p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => void unlink()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            Disconnect
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            We&apos;ll open Telegram with a one-time link. Press <strong>Start</strong> in the bot chat to link your account.
          </p>
          {deepLink && (
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-sky-400 hover:underline flex items-center gap-1"
            >
              Re-open Telegram link <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <Button size="sm" className="gap-2" onClick={() => void connect()} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Connect Telegram
          </Button>
        </div>
      )}
    </div>
  );
}
