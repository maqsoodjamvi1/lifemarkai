"use client";

interface LovableComposerFollowUpChipsProps {
  chips: string[];
  onSelect: (chip: string) => void;
}

/** Lovable-parity horizontal follow-up chips above the composer after builds. */
export function LovableComposerFollowUpChips({ chips, onSelect }: LovableComposerFollowUpChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="shrink-0 text-[11px] px-2.5 py-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)]/60 transition-colors whitespace-nowrap"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
