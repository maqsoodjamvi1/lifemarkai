
interface LovableComposerFollowUpChipsProps {
  chips: string[];
  onSelect: (chip: string) => void;
}

/** Lovable-parity horizontal follow-up chips above the composer after builds. */
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
            // Lovable dump pill: gap-0.5 px-[9px] py-1 text-sm rounded-full, bg-translucent, fg-primary
            className="shrink-0 text-sm px-[9px] py-1 rounded-full bg-[var(--bg-translucent,var(--bg-muted))] text-[var(--fg-primary)] hover:opacity-80 [@media(hover:none)]:active:opacity-80 transition-opacity whitespace-nowrap select-none"
          >
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
