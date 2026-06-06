"use client";

/**
 * /mfa-challenge
 * Shown after email/password login when the user has TOTP 2FA enabled.
 * Supabase Auth requires completing the MFA challenge before the session is fully active.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, KeyRound, AlertCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

export default function MfaChallengePage() {
  const router = useRouter();
  const supabase = createClient();

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the user's verified TOTP factor
  useEffect(() => {
    async function loadFactor() {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError || !data) { setLoading(false); return; }
      const verified = data.totp?.find((f) => f.status === "verified");
      if (!verified) {
        // No 2FA factor — redirect to dashboard
        router.replace("/dashboard");
        return;
      }
      setFactorId(verified.id);
      setLoading(false);
    }
    void loadFactor();
  }, [supabase, router]);

  async function handleVerify() {
    if (!factorId || code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    setError("");
    try {
      // Create challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challengeData) {
        setError(challengeError?.message ?? "Failed to start challenge.");
        return;
      }
      // Verify
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) {
        setError(verifyError.message.includes("Invalid") ? "Invalid code — check your authenticator and try again." : verifyError.message);
        return;
      }
      // Success — session is now fully authenticated
      router.replace("/dashboard");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-blue-500 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Two-factor authentication</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Enter the code from your authenticator app to continue.
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-violet-500/5 border border-violet-500/20">
            <ShieldCheck className="w-4 h-4 text-violet-400 shrink-0" />
            <p className="text-xs text-violet-300">
              Your account is protected with 2FA. Open your authenticator app and enter the current 6-digit code.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Verification code</label>
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              placeholder="000000"
              maxLength={6}
              className="font-mono tracking-widest text-center text-2xl h-12"
              onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) void handleVerify(); }}
              autoFocus
            />
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <Button
            onClick={() => void handleVerify()}
            disabled={busy || code.length !== 6}
            className="w-full gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {busy ? "Verifying…" : "Verify & continue"}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            Lost access to your authenticator?{" "}
            <a href="/support" className="underline underline-offset-2 hover:text-foreground">Contact support</a>
          </p>
        </div>
      </div>
    </div>
  );
}
