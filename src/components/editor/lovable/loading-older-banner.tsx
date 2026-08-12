
import { Loader2 } from "lucide-react";

/** Shown at the top of the chat timeline while paginating older messages. */
export function LovableLoadingOlderBanner() {
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-[var(--fg-tertiary)]">
      <Loader2 className="w-3 h-3 animate-spin" />
      Loading older messages…
    </div>
  );
}
