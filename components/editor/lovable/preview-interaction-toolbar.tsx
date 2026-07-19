"use client";

import {
  MousePointer, Pin, MessageSquarePlus, Terminal, RefreshCw,
  Maximize2, Minimize2, Frame, Monitor, Smartphone, Tablet, Pencil,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface LovablePreviewInteractionToolbarProps {
  visualEdit?: boolean;
  visualEditDisabled?: boolean;
  onVisualEditToggle?: () => void;
  commentPinMode?: boolean;
  onCommentPinToggle?: () => void;
  annotationsEnabled?: boolean;
  onAnnotationsToggle?: () => void;
  onCaptureAnnotate?: () => void;
  showConsole?: boolean;
  onConsoleToggle?: () => void;
  onRefresh?: () => void;
  previewFullscreen?: boolean;
  onFullscreenToggle?: () => void;
  showFrame?: boolean;
  onFrameToggle?: () => void;
  device?: "desktop" | "mobile" | "tablet";
  onDeviceChange?: (device: "desktop" | "mobile" | "tablet") => void;
  className?: string;
}

/**
 * Lovable-parity floating glass preview toolbar (select / annotate / console).
 */
export function LovablePreviewInteractionToolbar({
  visualEdit = false,
  visualEditDisabled = false,
  onVisualEditToggle,
  commentPinMode = false,
  onCommentPinToggle,
  annotationsEnabled = false,
  onAnnotationsToggle,
  onCaptureAnnotate,
  showConsole = false,
  onConsoleToggle,
  onRefresh,
  previewFullscreen = false,
  onFullscreenToggle,
  showFrame = true,
  onFrameToggle,
  device = "desktop",
  onDeviceChange,
  className,
}: LovablePreviewInteractionToolbarProps) {
  const btn = (active: boolean, disabled = false) =>
    cn(
      "flex size-8 items-center justify-center rounded-full transition-all active:scale-[0.97]",
      disabled
        ? "opacity-40 cursor-not-allowed text-[var(--fg-quaternary)]"
        : active
        ? "bg-[var(--bg-accent)]/20 text-[var(--fg-accent)] shadow-[inset_0_0_0_0.5px_var(--border-accent)]"
        : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--glow-neutral-hover)]",
    );

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-preview-toolbar
        className={cn(
          "absolute bottom-4 left-1/2 z-40 -translate-x-1/2",
          "flex items-center gap-0.5 rounded-full px-1.5 py-1",
          "bg-[var(--bg-translucent)] backdrop-blur-md shadow-surface-md",
          "border border-[color:var(--border-translucent)]",
          className,
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={visualEditDisabled}
              onClick={onVisualEditToggle}
              className={btn(visualEdit, visualEditDisabled)}
            >
              <MousePointer className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {visualEditDisabled
              ? "Visual edits disabled for version preview"
              : `Select elements · double-click text to edit inline ${visualEdit ? "(on)" : ""}`}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onCommentPinToggle} className={btn(commentPinMode)}>
              <Pin className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Pin comment {commentPinMode ? "(click preview)" : ""}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onAnnotationsToggle} className={btn(annotationsEnabled)}>
              <MessageSquarePlus className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Annotate preview</TooltipContent>
        </Tooltip>

        {onCaptureAnnotate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onCaptureAnnotate} className={btn(false)}>
                <Pencil className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Capture &amp; annotate for AI</TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onConsoleToggle} className={btn(showConsole)}>
              <Terminal className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Console &amp; Network</TooltipContent>
        </Tooltip>

        {device !== "desktop" && onFrameToggle && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onFrameToggle} className={btn(showFrame)}>
                <Frame className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Device frame</TooltipContent>
          </Tooltip>
        )}

        <div className="mx-0.5 h-5 w-px bg-[color:var(--border-translucent)]" />

        {onDeviceChange && (
          <>
            {([
              { d: "desktop" as const, icon: Monitor },
              { d: "tablet" as const, icon: Tablet },
              { d: "mobile" as const, icon: Smartphone },
            ]).map(({ d, icon: Icon }) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onDeviceChange(d)}
                    className={btn(device === d)}
                  >
                    <Icon className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{d}</TooltipContent>
              </Tooltip>
            ))}
            <div className="mx-0.5 h-5 w-px bg-[color:var(--border-translucent)]" />
          </>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onRefresh} className={btn(false)}>
              <RefreshCw className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" onClick={onFullscreenToggle} className={btn(previewFullscreen)}>
              {previewFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{previewFullscreen ? "Exit fullscreen" : "Fullscreen"}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
