"use client";

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
        "px-3 pb-4 pt-2 shrink-0 relative border-t border-[color:var(--border-translucent)]",
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
}

/** Inner form card matching Lovable `shadow-surface-xl rounded-6 bg-secondary-pulse`. */
export function LovableChatInputCard({ children, className }: LovableChatInputCardProps) {
  return (
    <form
      id="chat-input"
      onSubmit={(e) => e.preventDefault()}
      className={cn(
        "relative rounded-[var(--radius-6)] border border-[color:var(--border-default)]",
        "bg-[var(--bg-secondary-pulse)] shadow-surface-xl",
        "focus-within:border-[color:var(--border-accent)] transition-all duration-150",
        className,
      )}
    >
      {children}
    </form>
  );
}
