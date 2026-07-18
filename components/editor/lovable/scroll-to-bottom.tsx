"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableScrollToBottomProps {
  visible: boolean;
  onClick: () => void;
  className?: string;
}

/** Lovable-parity floating scroll-to-bottom control on the chat timeline. */
export function LovableScrollToBottom({ visible, onClick, className }: LovableScrollToBottomProps) {
  if (!visible) return null;
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      onClick={onClick}
      className={cn(
        "absolute bottom-3 right-4 z-10 flex size-8 items-center justify-center rounded-full",
        "bg-[var(--bg-secondary-pulse)] border border-[color:var(--border-default)] shadow-surface-md",
        "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)] transition-colors",
        className,
      )}
      title="Scroll to bottom"
    >
      <ChevronDown className="size-4" />
    </motion.button>
  );
}
