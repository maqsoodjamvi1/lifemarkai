
import { cn } from "@/lib/utils";

export interface LovableRecoveryChip {
  label: string;
  icon?: string;
  prompt: string;
  tooltip?: string;
}

/** Default recovery chips shown when preview/runtime errors are active. */
export const LOVABLE_RECOVERY_CHIPS: LovableRecoveryChip[] = [
  {
    label: "Investigate, don't code",
    icon: "🔍",
    prompt: "Investigate this without writing code yet. Walk me through what you find before suggesting changes.",
    tooltip: "Keeps the AI in read-only mode while you diagnose",
  },
  {
    label: "Suggest 3 ways",
    icon: "💡",
    prompt: "Suggest 3 ways to solve this without changing anything. Compare trade-offs for each.",
    tooltip: "Explore options before committing to one",
  },
  {
    label: "Revert + fix",
    icon: "↩️",
    prompt: "Please investigate this without breaking other features. If needed, revert to the last working version and fix from there.",
    tooltip: "Use after 2+ failed fix attempts",
  },
  {
    label: "Break it down",
    icon: "🧩",
    prompt: `Break this feature into small, testable steps. Use this template:

1. Create the new page (route + skeleton)
2. Add UI layout (no logic yet)
3. Connect the data (queries/mutations)
4. Add logic + edge cases
5. Test per role

Feature: [DESCRIBE YOUR FEATURE HERE]

Please confirm the breakdown before implementing anything.`,
    tooltip: "Break a risky recovery into verifiable steps",
  },
];

interface LovableRecoveryChipsProps {
  chips: LovableRecoveryChip[];
  onSelect: (prompt: string) => void;
  className?: string;
}

/** Lovable-parity contextual recovery chips above the composer. */
export function LovableRecoveryChips({ chips, onSelect, className }: LovableRecoveryChipsProps) {
  return (
    <div className={cn("px-3 pt-1 pb-1 flex gap-1.5 flex-wrap shrink-0", className)}>
      {chips.map(({ label, icon, prompt, tooltip }) => (
        <button
          key={label}
          type="button"
          title={tooltip}
          onClick={() => onSelect(prompt)}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-amber-500/25 bg-amber-500/[0.04] hover:bg-amber-500/10 hover:border-amber-500/40 text-amber-800/80 dark:text-amber-200/80 hover:text-amber-100 transition-all shadow-surface-xs"
        >
          {icon && <span>{icon}</span>}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
