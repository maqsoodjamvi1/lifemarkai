
interface LovableChangedFilesCardProps {
  paths: string[];
  onFocusPreview?: () => void;
}

export function LovableChangedFilesCard({ paths, onFocusPreview }: LovableChangedFilesCardProps) {
  if (!paths.length) return null;
  return (
    <div className="w-full mt-1 rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium block">
            Updated {paths.length} file{paths.length === 1 ? "" : "s"}
          </span>
          {onFocusPreview && (
            <button
              onClick={onFocusPreview}
              className="ml-auto text-[10px] px-2 py-0.5 rounded-full border border-border/60 bg-background/70 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            >
              Preview
            </button>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {paths.slice(0, 6).map((path) => (
            <span
              key={path}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-background/70 text-muted-foreground border border-border/40"
            >
              {path}
            </span>
          ))}
          {paths.length > 6 && (
            <span className="text-[10px] text-muted-foreground">+{paths.length - 6} more</span>
          )}
        </div>
      </div>
    </div>
  );
}
