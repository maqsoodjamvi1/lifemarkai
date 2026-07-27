
import { cn } from "@/lib/utils";

interface LovableChatComposerShellProps {
  children: React.ReactNode;
  className?: string;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  onPasteCapture?: React.ClipboardEventHandler<HTMLDivElement>;
}

/**
 * Lovable-parity composer footer — shadow-surface-xl rounded-6 input card.
 */
export function LovableChatComposerShell({
  children,
  className,
  onDragOver,
  onDragLeave,
  onDrop,
  onPasteCapture,
}: LovableChatComposerShellProps) {
  return (
    <div
      data-chat-composer
      className={cn(
        "relative mx-auto w-full max-w-3xl shrink-0 px-2 pb-2 pt-2",
        "max-h-[calc(100%-37px)]",
        "border-t border-[color:var(--border-translucent)]",
        "bg-[var(--bg-base)]/80 backdrop-blur-sm",
        className,
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onPasteCapture={onPasteCapture}
    >
      {children}
    </div>
  );
}

interface LovableChatInputCardProps {
  children: React.ReactNode;
  className?: string;
  /** Lovable dump: drop overlay always mounted on the form. */
  isDragging?: boolean;
}

/** Inner form card matching Lovable `shadow-surface-xl rounded-6 bg-secondary-pulse`. */
export function LovableChatInputCard({ children, className, isDragging = false }: LovableChatInputCardProps) {
  return (
    <form
      id="chat-input"
      onSubmit={(e) => e.preventDefault()}
      className={cn(
        // Lovable dump: group flex flex-col bg-secondary-pulse shadow-surface-xl rounded-6 gap-2 p-3
        "group relative z-20 flex flex-col gap-2 p-3 rounded-[var(--radius-6)]",
        "bg-[var(--bg-secondary-pulse)] shadow-surface-xl",
        "transition-colors duration-150 ease-in-out",
        className,
      )}
    >
      {children}
      {/* Import kept local to avoid circular deps with pre-input */}
      <LovableComposerDropOverlaySlot active={isDragging} />
    </form>
  );
}

function LovableComposerDropOverlaySlot({ active }: { active: boolean }) {
  // Inline to keep form self-contained (same copy as composer-drop-overlay).
  return (
    <div
      role="presentation"
      aria-hidden={!active}
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1",
        "rounded-[var(--radius-6)] border-2 border-dashed border-[color:var(--border-accent)]",
        "bg-[var(--bg-secondary-pulse)]/90 backdrop-blur-[1px] transition-opacity duration-150",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="text-sm font-semibold text-[var(--fg-primary)]">Add files</span>
      <span className="text-xs text-[var(--fg-tertiary)] px-4 text-center">
        Drop any files here to add them to your message
      </span>
    </div>
  );
}
