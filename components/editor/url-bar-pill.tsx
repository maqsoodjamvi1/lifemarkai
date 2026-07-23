"use client";

/**
 * UrlBarPill — Lovable-parity preview URL bar.
 *
 * Dump landmarks: #preview-url-bar, [data-url-bar-track], [data-url-bar-page-trigger]
 * Order: Refresh · route · Desktop/Mobile/Tablet view · Open in new tab
 */

import * as React from "react";
import { Monitor, Smartphone, Tablet, RotateCw, ExternalLink, ChevronLeft, ChevronRight, ChevronDown, Loader2, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Device = "desktop" | "mobile" | "tablet";

interface UrlBarPillProps {
  pageLabel?: string;
  routePath?: string;
  /** Lovable "current page, switch pages" dropdown — derived from app routes. */
  pages?: Array<{ label: string; path: string }>;
  device?: Device;
  onDeviceToggle?: () => void;
  onDeviceChange?: (device: Device) => void;
  onRefresh?: () => void;
  onOpenNewTab?: () => void;
  /** Type a route and press Enter — Lovable-style in-preview navigation */
  onNavigate?: (path: string) => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  /** Shown while preview boots or syncs (Lovable-style neutral label). */
  statusText?: string | null;
  className?: string;
}

export function UrlBarPill({
  pageLabel = "Homepage",
  routePath = "/",
  pages = [],
  device = "desktop",
  onDeviceToggle,
  onDeviceChange,
  onRefresh,
  onOpenNewTab,
  onNavigate,
  canGoBack = false,
  canGoForward = false,
  onBack,
  onForward,
  statusText = null,
  className,
}: UrlBarPillProps) {
  const [spin, setSpin] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(routePath);
  /** "Custom route…" from the pages dropdown forces the manual input. */
  const [manualEdit, setManualEdit] = React.useState(false);
  const showPagesDropdown = pages.length > 1 && !!onNavigate && !manualEdit;
  const spinTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => () => { if (spinTimerRef.current !== null) window.clearTimeout(spinTimerRef.current); }, []);

  React.useEffect(() => {
    if (!editing) setDraft(routePath);
  }, [routePath, editing]);

  function handleRefresh() {
    setSpin(true);
    onRefresh?.();
    if (spinTimerRef.current !== null) window.clearTimeout(spinTimerRef.current);
    spinTimerRef.current = window.setTimeout(() => setSpin(false), 500);
  }

  function commitRoute() {
    const target = draft.startsWith("/") ? draft : `/${draft}`;
    onNavigate?.(target);
    setEditing(false);
  }

  const deviceAria =
    device === "desktop" ? "Desktop view" : device === "mobile" ? "Mobile view" : "Tablet view";

  return (
    <div
      id="preview-url-bar"
      className={cn("mx-auto flex h-7 min-w-0 items-center gap-1", className)}
    >
      {(onBack || onForward) && (
        <div className="flex items-center gap-0 shrink-0">
          <button
            type="button"
            disabled={!canGoBack}
            onClick={onBack}
            className="flex size-6 items-center justify-center rounded-full text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] disabled:opacity-30"
            aria-label="Back"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            disabled={!canGoForward}
            onClick={onForward}
            className="flex size-6 items-center justify-center rounded-full text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] disabled:opacity-30"
            aria-label="Forward"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}

      {statusText && (
        <span className="hidden md:flex items-center gap-1 shrink-0 text-[10px] text-[var(--fg-tertiary)] max-w-[120px] truncate">
          <Loader2 className="size-3 animate-spin shrink-0" />
          <span className="truncate">{statusText}</span>
        </span>
      )}

      <div
        data-url-bar-track
        className="flex h-7 min-w-0 max-w-[256px] flex-1 items-center rounded-full px-1 bg-[var(--bg-translucent)] shadow-[inset_0_0_0_0.5px_var(--border-default)]"
        style={{ minWidth: 86 }}
      >
        <button
          type="button"
          aria-label="Refresh"
          onClick={handleRefresh}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg-primary)]"
        >
          <RotateCw
            className={cn("size-4 transition-transform", spin && "rotate-[360deg]")}
            style={{ transitionDuration: "500ms" }}
          />
        </button>
        <div className="flex min-w-0 flex-1 items-center px-1" data-url-bar-page-trigger>
          {showPagesDropdown ? (
            // Lovable dump: the route is a pages dropdown — "{page} — current page, switch pages"
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`${pageLabel} — current page, switch pages`}
                  className="flex min-w-0 flex-1 items-center gap-0.5 text-left outline-none group"
                >
                  <span className="truncate text-sm font-[450] leading-none text-[var(--fg-primary)]">
                    <span className="font-normal text-[var(--fg-quaternary)]">/</span>
                    {routePath.replace(/^\/+/, "")}
                  </span>
                  <ChevronDown className="size-3 shrink-0 text-[var(--fg-quaternary)] group-hover:text-[var(--fg-primary)] transition-colors" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 p-1">
                {pages.map((p) => (
                  <DropdownMenuItem
                    key={p.path}
                    className="text-xs gap-2 py-1.5"
                    onClick={() => onNavigate?.(p.path)}
                  >
                    <span className="w-3.5 shrink-0">
                      {p.path === routePath && <Check className="w-3 h-3" />}
                    </span>
                    <span className="flex-1 truncate">{p.label}</span>
                    <span className="text-[10px] font-mono text-[var(--fg-quaternary)] truncate max-w-[80px]">{p.path}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-xs gap-2 py-1.5"
                  onClick={() => {
                    setManualEdit(true);
                    setDraft(routePath);
                    setEditing(true);
                  }}
                >
                  <span className="w-3.5 shrink-0" />
                  Custom route…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : onNavigate ? (
            <input
              autoFocus={manualEdit}
              value={editing ? draft : routePath}
              onChange={(e) => { setDraft(e.target.value); setEditing(true); }}
              onFocus={() => { setDraft(routePath); setEditing(true); }}
              onBlur={() => { setEditing(false); setManualEdit(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitRoute();
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setDraft(routePath);
                  setEditing(false);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full min-w-0 bg-transparent text-sm font-mono text-[var(--fg-primary)] outline-none truncate"
              spellCheck={false}
              aria-label={`${pageLabel} — current page, switch pages`}
            />
          ) : (
            <span className="truncate text-sm font-[450] leading-none text-[var(--fg-primary)]" title={`${pageLabel} — ${routePath}`}>
              <span className="font-normal text-[var(--fg-quaternary)]">/</span>
              {routePath.replace(/^\/+/, "") || pageLabel}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        aria-label={deviceAria}
        onClick={() => {
          if (onDeviceChange) {
            const cycle: Device[] = ["desktop", "mobile", "tablet"];
            const idx = cycle.indexOf(device);
            onDeviceChange(cycle[(idx + 1) % cycle.length] ?? "desktop");
          } else {
            onDeviceToggle?.();
          }
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg-primary)] active:scale-[0.97]"
      >
        {device === "desktop" ? (
          <Monitor className="size-4" />
        ) : device === "mobile" ? (
          <Smartphone className="size-4" />
        ) : (
          <Tablet className="size-4" />
        )}
      </button>

      <button
        type="button"
        aria-label="Open in new tab"
        onClick={onOpenNewTab}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--fg-tertiary)] transition-colors hover:text-[var(--fg-primary)]"
      >
        <ExternalLink className="size-4" />
      </button>
    </div>
  );
}
