"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

interface LovableRoleTestBannerProps {
  chips: string[];
  onSelectChip: (chip: string) => void;
  onOpenTestingPanel: () => void;
}

export function LovableRoleTestBanner({ chips, onSelectChip, onOpenTestingPanel }: LovableRoleTestBannerProps) {
  if (!chips.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] px-2.5 py-2"
    >
      <div className="text-[10px] text-emerald-300 font-semibold mb-1.5 flex items-center gap-1">
        <Sparkles className="w-2.5 h-2.5" />
        Big change — re-test by role
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip}
            onClick={() => onSelectChip(chip)}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 transition-colors"
            title="Generates Playwright test code for this role, then opens the Browser Testing panel"
          >
            {chip}
          </button>
        ))}
        <button
          onClick={onOpenTestingPanel}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/20 bg-transparent hover:bg-emerald-500/5 text-emerald-300/70 hover:text-emerald-200 transition-colors"
          title="Skip the chips — open the Browser Testing panel directly"
        >
          ↗ Open testing panel
        </button>
      </div>
    </motion.div>
  );
}
