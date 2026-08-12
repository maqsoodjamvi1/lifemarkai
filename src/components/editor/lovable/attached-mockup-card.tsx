
import { motion } from "framer-motion";
import { Wand2,X } from "lucide-react";

interface LovableAttachedMockupCardProps {
  imageSrc: string;
  fileName?: string | null;
  onRemove: () => void;
  onAnnotate: () => void;
  onPreset: (prompt: string) => void;
}

/** Lovable-parity mockup attachment preview above the composer. */
export function LovableAttachedMockupCard({
  imageSrc,
  fileName,
  onRemove,
  onAnnotate,
  onPreset,
}: LovableAttachedMockupCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="mb-2 rounded-[var(--radius-3)] border border-violet-500/30 bg-violet-500/5 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-violet-500/20 bg-violet-500/10">
        <div className="flex items-center gap-1.5">
          <Wand2 className="w-3 h-3 text-violet-400" />
          <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">Mockup detected</span>
          {fileName && (
            <span className="text-[10px] text-violet-400/60 font-mono truncate max-w-[120px]">{fileName}</span>
          )}
        </div>
        <button type="button" onClick={onRemove} className="text-violet-400/60 hover:text-violet-300 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex gap-3 p-2.5">
        <div className="relative flex-shrink-0">
          <img
            src={imageSrc}
            alt="Mockup"
            className="h-20 w-auto max-w-[120px] rounded-lg border border-violet-500/20 object-cover shadow-sm"
          />
        </div>
        <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
          <p className="text-[11px] text-[var(--fg-tertiary)] leading-relaxed">
            AI will recreate this UI as React + Tailwind code. Add instructions below or send as-is.
          </p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={onAnnotate}
              className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition-colors"
            >
              Draw on image
            </button>
            {[
              ["Clone exactly", "Recreate this UI exactly. Match every layout detail, color, typography, spacing, and component."],
              ["Mobile-first", "Recreate this design but make it mobile-responsive and accessible. Use shadcn/ui components where appropriate."],
              ["Modernize", "Take inspiration from this design and create a modern, polished version with animations and dark mode support."],
            ].map(([label, prompt]) => (
              <button
                key={label}
                type="button"
                onClick={() => onPreset(prompt)}
                className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
