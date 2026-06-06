"use client";

/**
 * TwoFactorSection
 * Real TOTP 2FA using Supabase Auth MFA API.
 *
 * Flow:
 *   1. Load enrolled factors (listFactors)
 *   2. If none → show "Enable 2FA" button
 *   3. Enroll → API returns QR code + secret → user scans with authenticator app
 *   4. User enters 6-digit code → challenge + verify → factor becomes "verified"
 *   5. Enrolled → show "Remove 2FA" button (unenroll)
 */

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck, ShieldOff, Smartphone, KeyRound,
  Loader2, AlertCircle, CheckCircle2, Copy, Check,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Step = "idle" | "enrolling" | "verifying" | "removing";

interface Factor {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: "verified" | "unverified";
  created_at: string;
  updated_at: string;
}

interface EnrollData {
  id: string;
  qrCode: string;   // SVG data URI from Supabase
  secret: string;
  uri: string;
}

export function TwoFactorSection({ user: _user }: { user: User }) {
  const supabase = createClient();
  const { toast } = useToast();

  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("idle");
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!error && data) {
        setFactors((data.totp ?? []) as Factor[]);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => { void loadFactors(); }, [loadFactors]);

  // ── Enroll ────────────────────────────────────────────────────────────────

  async function handleEnroll() {
    setBusy(true);
    setStep("enrolling");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator App",
        issuer: "LifemarkAI",
      });
      if (error || !data) {
        toast({ title: "Enrollment failed", description: error?.message ?? "Unknown error", variant: "destructive" });
        setStep("idle");
        return;
      }
      setEnrollData({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      });
      setStep("verifying");
    } finally {
      setBusy(false);
    }
  }

  // ── Verify (complete enrollment) ──────────────────────────────────────────

  async function handleVerify() {
    if (!enrollData || code.length !== 6) { setCodeError("Enter the 6-digit code from your authenticator app."); return; }
    setBusy(true);
    setCodeError("");
    try {
      // Step 1: create challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollData.id });
      if (challengeError || !challengeData) {
        setCodeError(challengeError?.message ?? "Failed to create challenge");
        return;
      }
      // Step 2: verify
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollData.id,
        challengeId: challengeData.id,
        code,
      });
      if (verifyError) {
        setCodeError(verifyError.message.includes("Invalid") ? "Invalid code — check your authenticator and try again." : verifyError.message);
        return;
      }
      toast({ title: "2FA enabled", description: "Your account is now protected with two-factor authentication." });
      setStep("idle");
      setEnrollData(null);
      setCode("");
      await loadFactors();
    } finally {
      setBusy(false);
    }
  }

  // ── Cancel enrollment ─────────────────────────────────────────────────────

  async function handleCancelEnroll() {
    if (enrollData) {
      // Unenroll the unverified factor
      await supabase.auth.mfa.unenroll({ factorId: enrollData.id }).catch(() => {});
    }
    setStep("idle");
    setEnrollData(null);
    setCode("");
    setCodeError("");
  }

  // ── Remove / Unenroll ─────────────────────────────────────────────────────

  async function handleRemove(factorId: string) {
    setRemovingId(factorId);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        toast({ title: "Failed to remove 2FA", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "2FA removed", description: "Two-factor authentication has been disabled." });
      await loadFactors();
    } finally {
      setRemovingId(null);
    }
  }

  function copySecret() {
    if (!enrollData) return;
    void navigator.clipboard.writeText(enrollData.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const verifiedFactor = factors.find((f) => f.status === "verified");

  return (
    <div className="space-y-4">
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Two-factor authentication (2FA)
          </p>
          <div className="flex items-center gap-2">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            ) : verifiedFactor ? (
              <Badge className="gap-1 bg-emerald-500/15 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">
                <ShieldCheck className="w-3 h-3" /> Enabled
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <ShieldOff className="w-3 h-3" /> Not enabled
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
            Use an authenticator app (Google Authenticator, Authy, 1Password) to generate a one-time code at login.
          </p>
        </div>

        {!loading && step === "idle" && !verifiedFactor && (
          <Button size="sm" onClick={() => void handleEnroll()} disabled={busy} className="gap-1.5 shrink-0">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Smartphone className="w-3.5 h-3.5" />}
            Enable 2FA
          </Button>
        )}
      </div>

      {/* Enrolled factor row */}
      {!loading && verifiedFactor && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Authenticator App</p>
            <p className="text-xs text-muted-foreground">
              Added {new Date(verifiedFactor.created_at).toLocaleDateString("en", { dateStyle: "medium" })}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
            onClick={() => void handleRemove(verifiedFactor.id)}
            disabled={removingId === verifiedFactor.id}
          >
            {removingId === verifiedFactor.id
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <ShieldOff className="w-3 h-3" />
            }
            Remove
          </Button>
        </div>
      )}

      {/* Enrollment flow */}
      {step === "verifying" && enrollData && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Smartphone className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Scan the QR code</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Open your authenticator app and scan the code below, or enter the secret key manually.
              </p>
            </div>
          </div>

          {/* QR code */}
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-xl inline-block">
              {/* Supabase returns an SVG string — render via img tag */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enrollData.qrCode}
                alt="2FA QR Code"
                width={160}
                height={160}
                className="block"
              />
            </div>
          </div>

          {/* Manual secret */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-muted-foreground font-medium">Or enter key manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono bg-muted/50 border border-border rounded-md px-2.5 py-1.5 tracking-widest break-all">
                {enrollData.secret}
              </code>
              <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={copySecret} title="Copy secret">
                {copiedSecret ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          {/* Verify code */}
          <div className="space-y-2">
            <p className="text-xs font-medium">Enter the 6-digit code from your app to confirm:</p>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setCodeError(""); }}
                placeholder="000000"
                maxLength={6}
                className="font-mono tracking-widest text-center h-9 text-lg"
                onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) void handleVerify(); }}
                autoFocus
              />
              <Button onClick={() => void handleVerify()} disabled={busy || code.length !== 6} className="gap-1.5 shrink-0">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Verify
              </Button>
            </div>
            {codeError && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {codeError}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-1 border-t border-border/40">
            <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground flex-1">
              <CheckCircle2 className="w-3 h-3 shrink-0 mt-0.5 text-emerald-500" />
              Save your secret key in a safe place as a backup in case you lose access to your device.
            </div>
            <Button variant="ghost" size="sm" className="text-xs h-7 shrink-0" onClick={() => void handleCancelEnroll()}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
