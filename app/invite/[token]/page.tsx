/** Accept a project invite link, returning through auth when needed. */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withAuthRedirect } from "@/lib/auth/safe-redirect";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage({ params }: Props) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(withAuthRedirect("/login", `/invite/${token}`));
  }

  const { data, error } = await (supabase as any).rpc("accept_project_invite_token", {
    p_token: token,
  });
  const result = data as { ok?: boolean; error?: string; project_id?: string } | null;
  if (error || !result?.ok || !result.project_id) {
    return (
      <InviteResult
        ok={false}
        message={result?.error ?? error?.message ?? "This invite link is invalid or has been revoked."}
      />
    );
  }

  redirect(`/editor/${result.project_id}`);
}

function InviteResult({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <div className={`text-4xl ${ok ? "text-green-400" : "text-destructive"}`}>
          {ok ? "✓" : "×"}
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
