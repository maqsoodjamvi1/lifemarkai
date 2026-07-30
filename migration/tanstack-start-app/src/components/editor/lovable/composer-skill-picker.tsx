
import { AnimatePresence, motion } from "framer-motion";
import { Search, Sparkles, X } from "lucide-react";
import type { LovableSkillOption } from "./composer-template-picker";

interface LovableComposerSkillPickerProps {
  open: boolean;
  skills: LovableSkillOption[];
  search: string;
  onSearchChange: (value: string) => void;
  onSelect: (prompt: string, skillId: string) => void;
  onClose: () => void;
}

/** Dedicated skill library picker (separate from slash templates). */
export function LovableComposerSkillPicker({
  open,
  skills,
  search,
  onSearchChange,
  onSelect,
  onClose,
}: LovableComposerSkillPickerProps) {
  const query = search.toLowerCase().trim();
  const filtered = skills.filter(
    (s) =>
      !query ||
      s.name.toLowerCase().includes(query) ||
      (s.description ?? "").toLowerCase().includes(query) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(query)),
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-[11px] font-semibold text-muted-foreground truncate">Skills library</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Close skills"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-3 py-2 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search skills…"
                className="w-full h-8 pl-8 pr-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-violet-500/40"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                {skills.length === 0 ? "No skills yet — save a prompt as a skill from any message." : "No skills match your search."}
              </div>
            ) : (
              filtered.slice(0, 12).map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(skill.prompt, skill.id);
                  }}
                  className="w-full flex items-start gap-2.5 px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <span className="text-lg leading-none shrink-0 mt-0.5">{skill.icon ?? "✨"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{skill.name}</div>
                    {skill.description && (
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{skill.description}</div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
