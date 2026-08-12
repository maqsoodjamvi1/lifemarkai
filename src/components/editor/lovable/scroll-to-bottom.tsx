
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableScrollToBottomProps {
  visible: boolean;
  onClick: () => void;
  /** New messages arrived while the user was scrolled up. */
  newCount?: number;
  className?: string;
}

/** Lovable-parity floating scroll-to-bottom control on the chat timeline. */
export function LovableScrollToBottom({
  visible,
  onClick,
  newCount = 0,
  className,
}: LovableScrollToBottomProps) {
  if (!visible) return null;
  const label = newCount > 0 ? `${newCount} new` : "Scroll to bottom";

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={cn(
        "absolute bottom-3 right-4 z-10 flex items-center gap-1.5 rounded-full",
        "bg-[var(--bg-secondary-pulse)] border border-[color:var(--border-default)] shadow-surface-md",
        "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)] transition-colors",
        newCount > 0 ? "px-3 py-1.5 text-[11px] font-medium" : "size-8 justify-center",
        className,
      )}
      title={label}
    >
      {newCount > 0 && (
        <span className="text-violet-400 tabular-nums">{newCount > 99 ? "99+" : newCount} new</span>
      )}
      <ChevronDown className={cn("size-4 shrink-0", newCount > 0 && "size-3.5")} />
    </motion.button>
  );
}
