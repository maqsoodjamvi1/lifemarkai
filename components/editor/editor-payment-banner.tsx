import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Profile } from "@/types/database";

interface EditorPaymentBannerProps {
  profile: Profile | null;
  credits: number;
}

/** Lovable-style red payment / credits warning in the editor. */
export function EditorPaymentBanner({ profile, credits }: EditorPaymentBannerProps) {
  if (credits > 0) return null;

  const isPaid = profile?.plan && profile.plan !== "free";

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-red-600 text-white text-sm shrink-0">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p className="flex-1 leading-snug">
        {isPaid
          ? "Payment issue detected. Your account remains active, but will revert to Free if not resolved."
          : "No credits remaining. Upgrade your plan to keep building with AI."}
      </p>
      <Link
        href="/dashboard/billing"
        className="shrink-0 rounded-md bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25 transition-colors"
      >
        {isPaid ? "Update payment method" : "Upgrade plan"}
      </Link>
    </div>
  );
}
