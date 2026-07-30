import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/accept-invite")({
  validateSearch: (s: Record<string, unknown>) => ({
    teamId: typeof s.teamId === "string" ? s.teamId : "",
    memberId: typeof s.memberId === "string" ? s.memberId : "",
  }),
  head: () => ({ meta: [{ title: "Accept invite — LifemarkAI" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const { teamId, memberId } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "auth">("loading");
  const [teamName, setTeamName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function accept() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setStatus("auth");
        return;
      }
      if (!teamId || !memberId) {
        setStatus("error");
        setErrorMsg("Invalid invite link.");
        return;
      }
      const { data, error } = await (supabase as any).rpc("accept_team_invite", {
        p_team_id: teamId,
        p_member_id: memberId,
      });
      const result = data as { ok?: boolean; error?: string; team_name?: string } | null;
      if (error || !result?.ok) {
        setStatus("error");
        setErrorMsg(result?.error ?? error?.message ?? "Could not accept invite.");
        return;
      }
      setTeamName(result.team_name ?? "your team");
      setStatus("success");
      setTimeout(() => void navigate({ to: "/dashboard/team" }), 1500);
    }
    void accept();
  }, [teamId, memberId, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-2xl border border-border p-8 text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-violet-400" />
            <p className="text-sm text-muted-foreground">Accepting invite…</p>
          </>
        )}
        {status === "auth" && (
          <>
            <h1 className="text-xl font-semibold">Sign in to join</h1>
            <Link to="/login" search={{ next: `/accept-invite?teamId=${teamId}&memberId=${memberId}` }}>
              <Button>Sign in</Button>
            </Link>
          </>
        )}
        {status === "success" && (
          <>
            <h1 className="text-xl font-semibold">Joined {teamName}</h1>
            <p className="text-sm text-muted-foreground">Redirecting to team…</p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-semibold">Invite failed</h1>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <Link to="/dashboard">
              <Button variant="outline">Dashboard</Button>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
