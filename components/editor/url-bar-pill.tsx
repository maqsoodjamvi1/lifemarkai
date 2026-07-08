"use client";

/**
 * UrlBarPill — Lovable-parity preview URL bar.
 *
 * A centered rounded pill: device toggle · refresh · current-page label ·
 * open-in-new-tab. Styled on the OKLCH token layer. Presentational — the parent
 * owns preview state and passes handlers.
 */

import * as React from "react";
import { Monitor, Smartphone, RotateCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Device = "desktop" | "mobile";

interface UrlBarPillProps {
  /** Human page label, e.g. "Homepage" */
  pageLabel?: string;
  /** Route path shown faintly, e.g. "/" */
  routePath?: string;
  device?: Device;
  onDeviceToggle?: () => void;
  onRefresh?: () => void;
  onOpenNewTab?: () => void;
  className?: string;
}

export function UrlBarPill({
  pageLabel = "Homepage",
  routePath = "/",
  device = "desktop",
  onDeviceToggle,
  onRefresh,
  onOpenNewTab,
  className,
}: UrlBarPillProps) {
  const [spin, setSpin] = React.useState(false);

  function handleRefresh() {
    setSpin(true);
    onRefresh?.();
    window.setTimeout(() => setSpin(false), 500);
  }

  return (
    <div
      className={cn(
        "mx-auto flex h-7 min-w-0 items-center gap-1",
        className,
      )}
    >
      {/* Device toggle */}
      <button
        type="button"
        aria-label={device === "desktop" ? "Switch to mobile view" : "Switch to desktop view"}
        onClick={onDeviceToggle}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg-primary)] active:scale-[0.97]"
      >
        {device === "desktop" ? (
          <Monitor className="size-4" />
        ) : (
          <Smartphone className="size-4" />
        )}
      </button>

      {/* URL track */}
      <div
        className="flex h-7 min-w-0 max-w-[280px] flex-1 items-center rounded-full px-1 bg-[var(--bg-translucent)] shadow-[inset_0_0_0_0.5px_var(--border-default)]"
        style={{ minWidth: 120 }}
      >
        <button
          type="button"
          aria-label="Refresh preview"
          onClick={handleRefresh}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg-primary)] active:scale-[0.97]"
        >
          <RotateCw
            className={cn("size-4 transition-transform", spin && "rotate-[360deg]")}
            style={{ transitionDuration: "500ms" }}
          />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center px-1">
          <span className="truncate text-sm font-[450] leading-none text-[var(--fg-primary)]">
            <span className="pe-0.5 font-normal text-[var(--fg-quaternary)]">{routePath}</span>
            {pageLabel}
          </span>
        </div>
      </div>

      {/* Open in new tab */}
      <button
        type="button"
        aria-label="Open preview in new tab"
        onClick={onOpenNewTab}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg-primary)] active:scale-[0.97]"
      >
        <ExternalLink className="size-4" />
      </button>
    </div>
  );
}
