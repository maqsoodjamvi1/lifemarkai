"use client";

import { LOVABLE_QUICK_EMOJI } from "./types";

interface LovableMessageReactionsProps {
  reactions: Set<string>;
  onToggle: (emoji: string) => void;
}

export function LovableMessageReactions({ reactions, onToggle }: LovableMessageReactionsProps) {
  const active = LOVABLE_QUICK_EMOJI.filter((e) => reactions.has(e));
  if (active.length === 0) return null;
  return (
    <div className="flex items-center gap-1 mt-1 flex-wrap">
      {active.map((emoji) => (
        <button
          key={emoji}
          onClick={() => onToggle(emoji)}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-muted/60 border border-border/60 hover:bg-muted transition-colors"
          title="Click to remove"
        >
          <span>{emoji}</span>
        </button>
      ))}
    </div>
  );
}
