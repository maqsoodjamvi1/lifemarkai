"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Zap, CheckCircle, XCircle, Loader2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function AcceptInviteContent() {
  const router = useRouter();
  const params = useSearchParams();
  const teamId = params.get("teamId");
  const memberId = params.get("memberId");
  const [status, setStatus] = useState<"loading" | "success" | "error" | "auth">("loading");
  const [teamName, setTeamName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function accept() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setStatus("auth");
        return;
      }

      if (!teamId || !memberId) {
        setStatus("error");
        setErrorMsg("Invalid invite link.");
        return;
      }

      const { data: team } = await (supabase as any)
        .from("teams")
        .select("name")
        .eq("id", teamId)
        .maybeSingle();

      setTeamName(team?.name ?? "the team");

      const { error } = await (supabase as any)
        .from("team_members")
        .update({ user_id: user.id, accepted_at: new Date().toISOString() })
        .eq("id", memberId)
        .eq("team_id", teamId);

      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }

      setStatus("success");
      setTimeout(() => router.push("/dashboard/team"), 2500);
    }

    accept();
  }, [memberId, router, teamId]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-violet-600/15 blur-[100px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 w-full max-w-md bg-[#0f0f1a] border border-white/[0.08] rounded-2xl p-8 shadow-2xl text-center"
      >
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg">LifemarkAI</span>
        </div>

        {status === "loading" && (
          <>
            <Loader2 className="w-12 h-12 text-violet-400 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">Accepting invitation…</h2>
            <p className="text-slate-400 text-sm">Just a moment while we add you to the team.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">You're in! 🎉</h2>
            <p className="text-slate-400 text-sm mb-6">
              You've joined <strong className="text-white">{teamName}</strong>. Redirecting to your team workspace…
            </p>
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: 2.4, ease: "linear" }}
                className="h-full bg-gradient-to-r from-violet-600 to-indigo-600 rounded-full"
              />
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Invalid invitation</h2>
            <p className="text-slate-400 text-sm mb-6">{errorMsg || "This invite link may have expired or already been used."}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold text-sm hover:opacity-90 transition-all"
            >
              Go to Dashboard
            </button>
          </>
        )}

        {status === "auth" && (
          <>
            <div className="w-16 h-16 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-violet-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Sign in to accept</h2>
            <p className="text-slate-400 text-sm mb-6">
              You need an account to join <strong className="text-white">{teamName || "this team"}</strong>.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => router.push(`/login?next=/accept-invite?teamId=${teamId}&memberId=${memberId}`)}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 transition-all"
              >
                Sign in
              </button>
              <button
                onClick={() => router.push(`/signup?next=/accept-invite?teamId=${teamId}&memberId=${memberId}`)}
                className="w-full py-3 rounded-xl border border-white/10 text-white font-medium hover:bg-white/[0.04] transition-all"
              >
                Create an account
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteContent />
    </Suspense>
  );
}
