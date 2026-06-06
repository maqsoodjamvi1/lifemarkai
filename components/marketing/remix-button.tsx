"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface RemixButtonProps {
  projectId: string;
  remixCount: number;
}

export function RemixButton({ projectId, remixCount }: RemixButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  async function handleRemix() {
    setLoading(true);
    try {
      // 1) Dry-run — detect Supabase wiring so we can warn the user.
      // Lovable best-practice #7: "Remixing requires disconnecting Supabase first."
      const dry = await fetch(`/api/projects/${projectId}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      if (dry.status === 401) {
        router.push(`/signup?redirect=/dashboard`);
        return;
      }
      const dryData = await dry.json().catch(() => ({} as any));
      if (!dry.ok) throw new Error(dryData?.error ?? "Failed to remix");

      let disconnectSupabase = false;
      if (dryData.hasSupabase) {
        const evidence = (dryData.supabaseEvidence ?? []).slice(0, 4).join("\n  • ");
        const choice = window.confirm(
          [
            `"${dryData.sourceName}" uses Supabase.`,
            "",
            "Supabase doesn't carry over to remixes — the original database stays with the original project.",
            "",
            "Where we saw Supabase:",
            evidence ? `  • ${evidence}` : "",
            "",
            "Click OK to remix with Supabase code STRIPPED OUT (you'll wire your own data layer).",
            "Click Cancel to keep the Supabase code (you'll need to update env vars manually).",
          ].filter(Boolean).join("\n")
        );
        disconnectSupabase = choice;
      }

      // 2) Real remix.
      const res = await fetch(`/api/projects/${projectId}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disconnectSupabase }),
      });
      if (res.status === 401) {
        router.push(`/signup?redirect=/dashboard`);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to remix");
      }
      const data = await res.json();
      toast({
        title: "Project remixed!",
        description: data.disconnectedSupabase
          ? "Supabase code was stripped — re-wire your data layer when ready."
          : "Opening your copy in the editor…",
      });
      router.push(`/editor/${data.id}`);
    } catch (err) {
      toast({
        title: "Remix failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      size="sm"
      onClick={handleRemix}
      disabled={loading}
      className="gap-1.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <GitFork className="h-4 w-4" />
      )}
      Remix
      {remixCount > 0 && (
        <span className="ml-0.5 text-violet-200 text-xs">{remixCount}</span>
      )}
    </Button>
  );
}
