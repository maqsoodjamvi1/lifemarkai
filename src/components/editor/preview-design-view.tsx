import { Palette, X } from "lucide-react";
import { DesignSystemPanel } from "./design-system-panel";
import type { ProjectFile } from "@/types/database";

/**
 * Lovable Design View analogue: theme tokens on the live preview, not a new
 * left-rail tab. Writes tokens.css through the existing design-system API.
 */
export function PreviewDesignView({
  projectId,
  files,
  onFileUpdate,
  onClose,
}: {
  projectId: string;
  files: ProjectFile[];
  onFileUpdate?: (file: ProjectFile) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute inset-y-0 right-0 z-30 flex w-[min(22rem,100%)] flex-col border-l border-border bg-background shadow-sm"
      role="dialog"
      aria-label="Design view"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium">
          <Palette className="size-3.5 text-muted-foreground" />
          Design view
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close design view"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DesignSystemPanel
          projectId={projectId}
          files={files}
          compact
          onFilesUpdate={(next) => {
            const file = next[0];
            if (file) onFileUpdate?.(file);
          }}
        />
      </div>
    </div>
  );
}
