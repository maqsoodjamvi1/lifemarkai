
import { Check } from "lucide-react";
import {
DropdownMenu,
DropdownMenuContent,
DropdownMenuItem,
DropdownMenuSub,
DropdownMenuSubContent,
DropdownMenuSubTrigger,
DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EditorMode,LeftPanel } from "@/components/editor/editor-layout";
import { dispatchChatSettings } from "./chat-settings-events";

export interface ComposerContextMenuActions {
  onOpenPanel?: (panel: LeftPanel) => void;
  /** Lovable dump: no visible mode chip in the footer — mode switch lives here. */
  mode?: EditorMode;
  onModeChange?: (mode: EditorMode) => void;
  onScreenshot: () => void;
  onAddReference: () => void;
  onAddSkill: () => void;
  onAnalyzeData: () => void;
  onDesignDirections?: () => void;
  onAttach: () => void;
  onVisualEditToggle?: () => void;
  isVisualEditActive?: boolean;
  onToggleMobileMode?: () => void;
  mobileMode?: boolean;
  mobileDisabled?: boolean;
  onToggleFileGenPicker?: () => void;
  showFileGenPicker?: boolean;
  /**
   * Opens the model / multi-agent menu.
   *
   * This entry point was missing, which made both features unreachable: the
   * menu in composer-bottom-row renders only when `multiAgent ||
   * modelManuallySelectedRef.current`, and the ONLY controls that set either
   * flag live inside that same menu — a closed loop. Nothing else in the app
   * called onMultiAgentChange, so a user could never pick a model or turn on
   * multi-agent at all.
   */
  onToggleModelMenu?: () => void;
  showModelMenu?: boolean;
}

/** Lovable-parity + context menu in the composer footer. */
export function LovableComposerContextMenu({ actions }: { actions: ComposerContextMenuActions }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="chat-input-action-menu-trigger"
          aria-label="Chat actions"
          className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--bg-translucent,var(--bg-muted))] text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/80 transition-colors flex-shrink-0 text-base font-light"
          title="Chat actions"
        >
          +
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52 p-1">
        {actions.onModeChange && (
          <>
            {(["chat", "plan", "build", "agent"] as EditorMode[]).map((m) => (
              <DropdownMenuItem
                key={m}
                className="text-xs gap-2.5 py-2"
                onClick={() => actions.onModeChange?.(m)}
              >
                <span className="w-3.5">{actions.mode === m && <Check className="w-3 h-3" />}</span>
                <span className="flex-1 capitalize">{m}</span>
              </DropdownMenuItem>
            ))}
            <div className="h-px bg-[color:var(--border-default)] my-1" />
          </>
        )}
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => dispatchChatSettings("search")}>
          <span className="flex-1">Search chat</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => dispatchChatSettings("bookmarks")}>
          Bookmarks
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => dispatchChatSettings("export-markdown")}>
          Export chat
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => dispatchChatSettings("clear")}>
          Clear chat
        </DropdownMenuItem>
        <div className="h-px bg-[color:var(--border-default)] my-1" />
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onScreenshot}>
          Take a screenshot
        </DropdownMenuItem>
        <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onAttach}>
          Attach
        </DropdownMenuItem>
        {actions.onVisualEditToggle && (
          <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onVisualEditToggle}>
            {actions.isVisualEditActive ? "Exit visual edits" : "Visual edits"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="text-xs py-2">More</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("history")}>
              History
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("github")}>
              GitHub
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => actions.onOpenPanel?.("connectors")}>
              Connectors
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
            {actions.onToggleMobileMode && (
              <DropdownMenuItem
                className="text-xs gap-2.5 py-2"
                disabled={actions.mobileDisabled}
                onClick={actions.onToggleMobileMode}
              >
                {actions.mobileMode ? "Desktop composer" : "Mobile composer"}
              </DropdownMenuItem>
            )}
            {actions.onToggleFileGenPicker && (
              <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onToggleFileGenPicker}>
                {actions.showFileGenPicker ? "Hide file generator" : "Generate file"}
              </DropdownMenuItem>
            )}
            {actions.onToggleModelMenu && (
              <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={actions.onToggleModelMenu}>
                {actions.showModelMenu ? "Hide model options" : "Model & multi-agent"}
              </DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
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
