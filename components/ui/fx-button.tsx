"use client";

/**
 * FxButton — Lovable-parity "physical" button primitive.
 *
 * Reproduces Lovable's layered button system (rim + interaction + drop-shadow
 * fx layers) on top of the OKLCH token layer in globals.css. Three visual
 * variants: `accent` (blue publish-style), `inverse` (high-contrast), and
 * `soft` (translucent surface). Purely presentational — compose it wherever a
 * standout action button is wanted (Publish, Try-to-fix, send).
 */

import * as React from "react";
import { cn } from "@/lib/utils";

type FxVariant = "accent" | "inverse" | "soft";

export interface FxButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: FxVariant;
  /** Render as a perfectly square icon button */
  square?: boolean;
}

const SURFACE: Record<FxVariant, string> = {
  accent: "text-[var(--fg-emphasis)] bg-[var(--bg-accent)]",
  inverse: "text-[var(--fg-inverse)] bg-[var(--bg-inverse)]",
  soft: "text-[var(--fg-primary)] bg-[var(--bg-translucent)]",
};

export const FxButton = React.forwardRef<HTMLButtonElement, FxButtonProps>(
  ({ variant = "soft", square = false, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-fx-button=""
        className={cn(
          "group relative isolate box-border inline-flex h-7 select-none items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full text-sm font-normal transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          square ? "w-7 p-0" : "px-3 py-1",
          SURFACE[variant],
          className,
        )}
        {...props}
      >
        {/* drop-shadow layer */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[-1] rounded-[inherit] shadow-[0_2px_2px_-1px_rgba(0,0,0,0.12),0_4px_4px_-2px_rgba(0,0,0,0.12)] transition-opacity duration-150 group-active:opacity-0 group-disabled:opacity-0"
        />
        {/* interaction (hover/press) layer */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 rounded-[inherit] bg-black/0 opacity-0 transition-opacity duration-150 group-hover:opacity-[0.06] group-active:opacity-[0.1] dark:bg-white/0 dark:group-hover:opacity-[0.08] dark:group-active:opacity-[0.12]"
        />
        {/* rim layer */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[3] rounded-[inherit] shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.16)] dark:shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.16)]"
        />
        <span className="relative z-30 inline-flex h-full w-full items-center justify-center gap-1 [transform:translateZ(0)]">
          {children}
        </span>
      </button>
    );
  },
);
FxButton.displayName = "FxButton";
