"use client";

import { ChevronUp, Loader2 } from "lucide-react";

interface LovableLoadOlderButtonProps {
  loading?: boolean;
  onClick: () => void;
}

/** Manual control to paginate earlier chat history (Lovable long-thread parity). */
export function LovableLoadOlderButton({ loading, onClick }: LovableLoadOlderButtonProps) {
  return (
    <div className="flex justify-center py-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-muted/30 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <ChevronUp className="w-3 h-3" />
        )}
        Load earlier messages
      </button>
    </div>
  );
}
