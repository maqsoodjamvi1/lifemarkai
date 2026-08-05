
/**
 * ViewSwitcherPill — Lovable-parity animated segmented control.
 *
 * A rounded track where the active segment expands to reveal its label and a
 * soft highlight slides between segments (framer-motion `layoutId`). Inactive
 * segments show icon-only. Mirrors Lovable's Preview / Files / Code / More
 * switcher. Generic: pass any set of tabs.
 */

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ViewSwitcherTab {
  id: string;
  label: string;
  icon: React.ElementType;
  /** Optional trailing adornment (e.g. a lock for gated tabs) */
  disabled?: boolean;
}

interface ViewSwitcherPillProps {
  tabs: ViewSwitcherTab[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
  /** Optional trailing content rendered inside the track (e.g. a "More" menu). */
  children?: React.ReactNode;
}

const EASE = [0.32, 0.72, 0, 1] as const;

export function ViewSwitcherPill({
  tabs,
  activeId,
  onSelect,
  className,
  children,
}: ViewSwitcherPillProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "view-switcher-track relative inline-flex h-7 items-center gap-0.5 rounded-full p-0.5",
        "bg-[var(--bg-translucent)] shadow-[inset_0_0_0_0.5px_var(--border-default)]",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            disabled={tab.disabled}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "relative z-10 flex h-6 shrink-0 items-center overflow-hidden rounded-full outline-none transition-colors duration-150",
              "disabled:cursor-not-allowed disabled:opacity-50",
              isActive
                ? "text-[#1F55F1] dark:text-[#4d94ff]"
                : "cursor-pointer text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] active:scale-[0.97]",
              isActive ? "px-2" : "px-1.5",
            )}
          >
            {isActive && (
              <motion.span
                layoutId="view-switcher-highlight"
                className="view-switcher-pill-soft absolute inset-0 -z-10 rounded-full bg-[rgba(0,102,255,0.08)] shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_0_0_1px_rgba(0,102,255,0.25)]"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
              <Icon className="h-4 w-4 shrink-0" />
            </span>
            <AnimatePresence initial={false}>
              {isActive && (
                <motion.span
                  key="label"
                  initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                  animate={{ width: "auto", opacity: 1, marginLeft: 4 }}
                  exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                  transition={{ duration: 0.34, ease: EASE }}
                  className="overflow-hidden whitespace-nowrap text-sm font-[450] leading-none"
                >
                  {tab.label}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        );
      })}
      {children}
    </div>
  );
}
