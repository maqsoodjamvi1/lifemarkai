
import { FileCode2 } from "lucide-react";

interface LovableStreamingFilesCardProps {
  paths: string[];
  maxVisible?: number;
}

/** Lovable-parity live "Editing N files" card during build streams. */
export function LovableStreamingFilesCard({ paths, maxVisible = 8 }: LovableStreamingFilesCardProps) {
  if (paths.length === 0) return null;
  return (
    <div className="rounded-[var(--radius-3)] border border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)] overflow-hidden mb-1">
      <div className="px-3 py-2 border-b border-[color:var(--border-default)] bg-[var(--bg-muted)] flex items-center gap-2">
        <FileCode2 className="w-3.5 h-3.5 text-violet-700 dark:text-violet-300 shrink-0" />
        <span className="text-sm font-[500] text-[var(--fg-primary)]">
          Editing {paths.length} file{paths.length === 1 ? "" : "s"}
        </span>
        <span className="ml-auto text-[10px] text-[var(--fg-tertiary)]">live</span>
      </div>
      <div className="px-3 py-2 flex flex-wrap gap-1.5">
        {paths.slice(0, maxVisible).map((path) => (
          <span
            key={path}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background/70 text-[var(--fg-tertiary)] border border-[color:var(--border-default)]"
          >
            {path.split("/").pop() ?? path}
          </span>
        ))}
        {paths.length > maxVisible && (
          <span className="text-[10px] text-[var(--fg-tertiary)] py-0.5">
            +{paths.length - maxVisible} more
          </span>
        )}
      </div>
    </div>
  );
}
