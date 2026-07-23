"use client";

import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableComposerMobileToggleProps {
  active: boolean;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
}

/** Lovable-parity React Native / Expo framework toggle in the composer. */
export function LovableComposerMobileToggle({
  active,
  disabled,
  onToggle,
  className,
}: LovableComposerMobileToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={active ? "Building for React Native (Expo)" : "Building for web"}
      className={cn(
        "h-7 px-2.5 rounded-lg border text-xs font-medium transition-colors inline-flex items-center gap-1.5 shrink-0",
        active
          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "border-[color:var(--border-default)] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/40",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <Smartphone className="w-3.5 h-3.5 shrink-0" />
      <span>{active ? "Mobile" : "Web"}</span>
    </button>
  );
}
