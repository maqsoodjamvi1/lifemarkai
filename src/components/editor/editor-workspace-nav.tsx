import { Cloud, Code2, Eye, FolderTree } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LeftPanel, ViewMode } from "./editor-layout";

const ITEMS: Array<{
  id: "cloud" | "preview" | "code" | "files";
  label: string;
  icon: typeof Cloud;
}> = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "code", label: "Code", icon: Code2 },
  { id: "files", label: "Files", icon: FolderTree },
  { id: "cloud", label: "Cloud", icon: Cloud },
];

export function EditorWorkspaceNav({
  viewMode,
  rightPanel,
  showFileTree,
  onViewChange,
  onRightPanelChange,
  onToggleFileTree,
  className,
}: {
  viewMode: ViewMode;
  rightPanel?: LeftPanel | null;
  showFileTree?: boolean;
  onViewChange: (view: ViewMode) => void;
  onRightPanelChange?: (panel: LeftPanel | null) => void;
  onToggleFileTree?: () => void;
  className?: string;
}) {
  const canvasClear = rightPanel == null;
  const activeId =
    rightPanel === "cloud"
      ? "cloud"
      : viewMode === "code" && canvasClear
        ? "code"
        : showFileTree && canvasClear
          ? "files"
          : canvasClear
            ? "preview"
            : null;

  return (
    <nav
      aria-label="Workspace"
      className={cn(
        "flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto rounded-full border border-border/70 bg-background/80 p-0.5",
        className,
      )}
    >
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = activeId === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (id === "preview") {
                onRightPanelChange?.(null);
                onViewChange("preview");
                return;
              }
              if (id === "code") {
                onRightPanelChange?.(null);
                onViewChange("code");
                return;
              }
              if (id === "files") {
                onRightPanelChange?.(null);
                onToggleFileTree?.();
                return;
              }
              onRightPanelChange?.(rightPanel === "cloud" ? null : "cloud");
            }}
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors",
              active
                ? "bg-blue-500/10 text-[#1F55F1]"
                : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
