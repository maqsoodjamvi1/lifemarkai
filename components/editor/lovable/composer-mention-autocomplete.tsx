"use client";

import { AnimatePresence, motion } from "framer-motion";

export type LovableMentionItem =
  | { kind: "file"; path: string }
  | { kind: "user"; display: string; email: string }
  | { kind: "xproject"; projectName: string; projectId: string; filePath: string }
  | { kind: "connector"; id: string; name: string; emoji: string };

interface LovableComposerMentionAutocompleteProps {
  open: boolean;
  isCrossProjectQuery: boolean;
  items: LovableMentionItem[];
  selectedIndex: number;
  onSelect: (item: LovableMentionItem) => void;
}

export function LovableComposerMentionAutocomplete({
  open,
  isCrossProjectQuery,
  items,
  selectedIndex,
  onSelect,
}: LovableComposerMentionAutocompleteProps) {
  return (
    <AnimatePresence>
      {open && items.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
        >
          <div className="px-2 py-1 border-b border-border">
            <span className="text-[10px] text-muted-foreground font-mono">
              {isCrossProjectQuery ? "@ reference from another project" : "@ mention file or collaborator"}
            </span>
          </div>
          {items.map((item, idx) => (
            <button
              key={idx}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                idx === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              }`}
            >
              {item.kind === "file" ? (
                <>
                  <span className="text-muted-foreground/50">📄</span>
                  <span className="font-mono truncate text-violet-400">{item.path}</span>
                </>
              ) : item.kind === "xproject" ? (
                <>
                  <span className="text-muted-foreground/50">{item.filePath ? "📄" : "📁"}</span>
                  <span className="font-medium truncate text-amber-400">{item.projectName}</span>
                  {item.filePath ? (
                    <span className="font-mono text-muted-foreground/70 text-[10px] truncate ml-auto">
                      {item.filePath}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50 text-[10px] ml-auto">click to browse files →</span>
                  )}
                </>
              ) : item.kind === "connector" ? (
                <>
                  <span className="text-muted-foreground/50">{item.emoji}</span>
                  <span className="font-medium truncate text-cyan-400">{item.name}</span>
                  <span className="text-muted-foreground/50 text-[10px] ml-auto">connector</span>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground/50">👤</span>
                  <span className="font-medium truncate">{item.display}</span>
                  <span className="text-muted-foreground/50 text-[10px] truncate ml-auto">{item.email}</span>
                </>
              )}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
