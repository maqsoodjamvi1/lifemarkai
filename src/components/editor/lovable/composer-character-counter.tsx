
import { CHAT_INPUT_CAPABILITIES } from "@/lib/ai/chat-capabilities";

interface LovableComposerCharacterCounterProps {
  length: number;
}

export function LovableComposerCharacterCounter({ length }: LovableComposerCharacterCounterProps) {
  if (length <= 0) return null;
  const { maxMessageLength, warnMessageLength } = CHAT_INPUT_CAPABILITIES;
  return (
    <div className="flex items-center justify-between gap-3 px-4 pb-0.5">
      {length > 800 ? (
        <span className="text-[10px] text-amber-700/80 dark:text-amber-300/80 leading-snug">
          Tip: break large requests into smaller, testable blocks — try Plan mode first.
        </span>
      ) : (
        <span />
      )}
      <span
        className={`text-[10px] tabular-nums transition-colors ${
          length > maxMessageLength
            ? "text-red-400"
            : length > warnMessageLength
              ? "text-amber-400"
              : "text-muted-foreground/40"
        }`}
      >
        {length} / {maxMessageLength.toLocaleString()}
      </span>
    </div>
  );
}

export function lovableComposerInputRingClass(length: number): string {
  const { maxMessageLength, warnMessageLength } = CHAT_INPUT_CAPABILITIES;
  if (length > maxMessageLength) return "ring-1 ring-red-500/50 rounded";
  if (length > warnMessageLength) return "ring-1 ring-amber-500/40 rounded";
  return "";
}
