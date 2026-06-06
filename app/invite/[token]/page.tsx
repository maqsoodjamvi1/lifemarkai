/**
 * /invite/[token]
 * Accept a project invite link. If not logged in, redirect to login then back here.
 */
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";

interface Props {
  params: { token: string };
}

export default async function AcceptInvitePage({ params }: Props) {
  const { token } = params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Redirect to login, then back here
    redirect(`/login?redirect=/invite/${token}`);
  }

  const admin = await createAdminClient();

  // Look up the token
  const { data: row } = await (admin as any)
    .from("project_invite_tokens")
    .select("id, project_id, role, expires_at, used_count, max_uses")
    .eq("token", token)
    .single();

  if (!row) {
    return <InviteResult ok={false} message="This invite link is invalid or has been revoked." />;
  }

  if (new Date(row.expires_at) < new Date()) {
    return <InviteResult ok={false} message="This invite link has expired." />;
  }

  if (row.max_uses != null && row.used_count >= row.max_uses) {
    return <InviteResult ok={false} message="This invite link has reached its maximum number of uses." />;
  }

  // Don't add the project owner as a collaborator
  const { data: project } = await (admin as any)
    .from("projects")
    .select("id, name, user_id")
    .eq("id", row.project_id)
    .single();

  if (!project) {
    return <InviteResult ok={false} message="The project no longer exists." />;
  }

  if (project.user_id === user.id) {
    // Owner accepting their own link — just redirect to the project
    redirect(`/editor/${row.project_id as string}`);
  }

  // Upsert collaborator row
  await (admin as any)
    .from("collaborators")
    .upsert(
      { project_id: row.project_id, user_id: user.id, role: row.role },
      { onConflict: "project_id,user_id" }
    );

  // Increment used_count
  await (admin as any)
    .from("project_invite_tokens")
    .update({ used_count: (row.used_count as number) + 1 })
    .eq("id", row.id);

  redirect(`/editor/${row.project_id as string}`);
}

function InviteResult({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <div className={`text-4xl ${ok ? "text-green-400" : "text-destructive"}`}>
          {ok ? "✓" : "✗"}
        </div>
        <h1 className="text-xl font-semibold">{ok ? "You're in!" : "Invite invalid"}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
        <a
          href="/dashboard"
          className="inline-block mt-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-500 transition-colors"
        >
          Go to dashboard
        </a>
      </div>
    </div>
  );
}
