import Link from "next/link";
import { AlertTriangle } from "lucide-react";

interface BillingAlertBannerProps {
  credits: number;
  plan: string;
}

export function BillingAlertBanner({ credits, plan }: BillingAlertBannerProps) {
  if (plan !== "free" && credits > 10) return null;

  const lowCredits = credits <= 10;

  return (
    <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm">
      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
      <p className="flex-1 text-amber-900 dark:text-amber-100">
        {lowCredits
          ? `You have ${credits} credit${credits === 1 ? "" : "s"} left. Upgrade to keep building without interruption.`
          : "Upgrade to Pro for more credits, custom domains, and team features."}
      </p>
      <Link
        href="/dashboard/billing"
        className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline"
      >
        View billing
      </Link>
    </div>
  );
}
