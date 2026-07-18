"use client";

import { AlertCircle, Wand2 } from "lucide-react";

interface LovableNoCreditsBannerProps {
  className?: string;
}

export function LovableNoCreditsBanner({ className }: LovableNoCreditsBannerProps) {
  return (
    <div className={`mx-3 mb-2 px-3 py-2 rounded-[var(--radius-3)] bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-xs text-destructive ${className ?? ""}`}>
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      No credits remaining. Upgrade your plan or wait until tomorrow.
    </div>
  );
}

interface LovableAutofixBannerProps {
  attempt: number;
  maxAttempts: number;
}

export function LovableAutofixBanner({ attempt, maxAttempts }: LovableAutofixBannerProps) {
  return (
    <div className="mx-3 mb-2 px-3 py-2 rounded-[var(--radius-3)] bg-violet-500/10 border border-violet-500/20 flex items-center gap-2 text-xs text-violet-400">
      <Wand2 className="w-3.5 h-3.5 shrink-0 animate-pulse" />
      Auto-fixing preview error… (attempt {attempt}/{maxAttempts})
    </div>
  );
}
