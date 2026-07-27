import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { GitFork, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RemixButtonProps {
  projectId: string;
  remixCount?: number;
}

/** Thin client remix — hits proxied /api/projects/:id/remix */
export function RemixButton({ projectId, remixCount = 0 }: RemixButtonProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remix() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const dry = await fetch(`/api/projects/${projectId}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const dryData = await dry.json().catch(() => ({}));
      if (dry.status === 401) {
        void navigate({ to: "/login", search: { next: typeof window !== "undefined" ? window.location.pathname : "/explore" } });
        return;
      }
      if (!dry.ok) throw new Error(dryData?.error ?? "Failed to remix");

      const res = await fetch(`/api/projects/${projectId}/remix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Failed to remix");
      if (data?.id) {
        void navigate({ to: "/editor/$projectId", params: { projectId: data.id as string } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remix failed");
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void remix()} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <GitFork className="h-4 w-4 mr-1.5" />}
        Remix
        {remixCount > 0 && <span className="ml-1 text-xs opacity-80">{remixCount}</span>}
      </Button>
      {error && <span className="text-[10px] text-red-500 max-w-[200px] text-right">{error}</span>}
    </div>
  );
}
