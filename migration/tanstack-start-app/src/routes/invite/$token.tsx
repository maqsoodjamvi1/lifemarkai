import { createFileRoute,Link,redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { Button } from "@/components/ui/button";

const acceptInvite = createServerFn({ method: "GET" })
  .validator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthenticated" as const };

    const { data: result, error } = await supabase.rpc("accept_project_invite_token", {
      p_token: data.token,
    });
    const parsed = result as { ok?: boolean; error?: string; project_id?: string } | null;
    if (error || !parsed?.ok || !parsed.project_id) {
      return {
        status: "error" as const,
        message: parsed?.error ?? error?.message ?? "This invite link is invalid or has been revoked.",
      };
    }
    return { status: "ok" as const, projectId: parsed.project_id };
  });

export const Route = createFileRoute("/invite/$token")({
  loader: async ({ params }) => {
    const result = await acceptInvite({ data: { token: params.token } });
    if (result.status === "unauthenticated") {
      throw redirect({
        to: "/login",
        search: { next: `/invite/${params.token}` },
      });
    }
    if (result.status === "ok") {
      throw redirect({ to: "/editor/$projectId", params: { projectId: result.projectId } });
    }
    return result;
  },
  component: InviteResultPage,
});

function InviteResultPage() {
  const data = Route.useLoaderData();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <div className="text-4xl text-destructive">×</div>
        <h1 className="text-xl font-semibold">Invite invalid</h1>
        <p className="text-sm text-muted-foreground">
          {data.status === "error" ? data.message : "Unable to accept invite."}
        </p>
        <Link to="/dashboard">
          <Button>Go to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
