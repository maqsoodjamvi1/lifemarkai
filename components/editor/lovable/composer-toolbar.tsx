"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LeftPanel } from "@/components/editor/editor-layout";

export interface ComposerContextMenuActions {
  onOpenPanel?: (panel: LeftPanel) => void;
  onScreenshot: () => void;
  onAddReference: () => void;
  onAddSkill: () => void;
  onAnalyzeData: () => void;
  onDesignDirections?: () => void;
  onAttach: () => void;
}

/** Lovable-parity + context menu in the composer footer. */
export function LovableComposerContextMenu({ actions }: { actions: ComposerContextMenuActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center w-7 h-7 rounded-lg border border-[color:var(--border-default)] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/60 transition-colors flex-shrink-0 text-base font-light"
          title="Add context or attach"
        >
          +
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52 p-1">
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("settings")}>
          <span className="flex-1">Settings</span>
          <span className="text-[10px] text-[var(--fg-tertiary)]/60">Ctrl+.</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("history")}>
          History
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("knowledge")}>
          Knowledge
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("github")}>
          GitHub
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("connectors")}>
          <span className="flex-1">Connectors</span>
        </DropdownMenuItem>
        <div className="h-px bg-[color:var(--border-default)] my-1" />
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onScreenshot}>
          Take a screenshot
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onAddReference}>
          Add reference
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onAddSkill}>
          Add skill
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onAnalyzeData}>
          Analyze data
        </DropdownMenuItem>
        {actions.onDesignDirections && (
          <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onDesignDirections}>
            Design directions…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onAttach}>
          Attach
        </DropdownMenuItem>
        <div className="h-px bg-[color:var(--border-default)] my-1" />
        <div className="px-2 py-2">
          <p className="text-[10px] font-medium text-[var(--fg-primary)]/80">Connectors have moved</p>
          <p className="text-[10px] text-[var(--fg-tertiary)] leading-snug">
            Find the new connector experience on the homepage.
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface LovableVisualEditsButtonProps {
  active: boolean;
  onClick: () => void;
}

export function LovableVisualEditsButton({ active, onClick }: LovableVisualEditsButtonProps) {
  return (
    <button
      type="button"
      className={`flex h-7 flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors ${
        active
          ? "border-violet-500/50 bg-violet-500/10 text-[var(--fg-primary)]"
          : "border-[color:var(--border-default)] text-[var(--fg-tertiary)] hover:bg-[var(--bg-muted)]/60 hover:text-[var(--fg-primary)]"
      }`}
      onClick={onClick}
      title={active ? "Exit visual edit mode" : "Select and edit preview elements"}
    >
      <span className="text-[var(--fg-tertiary)]/60 font-medium">@</span>
      <span>Visual edits</span>
    </button>
  );
}
