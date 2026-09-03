import { Sparkles } from "lucide-react";

interface LovableComposerFollowUpChipsProps {
  chips: string[];
  onSelect: (chip: string) => void;
}

/** Lovable-parity: chips above the composer send on click, they do not only fill the input. */
export function LovableComposerFollowUpChips({ chips, onSelect }: LovableComposerFollowUpChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className="relative mb-2">
      <div
        data-horizontal-scroll
        className="flex gap-1.5 overflow-x-auto pb-0.5 pr-6"
        style={{ scrollbarWidth: "none" }}
      >
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            className="flex shrink-0 items-center gap-1 text-sm px-[9px] py-1 rounded-full border border-border/50 bg-muted/50 text-foreground hover:bg-muted hover:border-border cursor-pointer [@media(hover:none)]:active:opacity-80 transition-colors whitespace-nowrap select-none"
          >
            <Sparkles className="w-3 h-3 text-[var(--fg-accent)] shrink-0" />
            {chip}
          </button>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--bg-base)] to-transparent"
      />
    </div>
  );
}
