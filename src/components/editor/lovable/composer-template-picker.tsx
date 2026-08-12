
import { AnimatePresence,motion } from "framer-motion";
import { Palette,Sparkles } from "lucide-react";
import { LOVABLE_DESIGN_DIRECTIONS_SLASH_KEY,LOVABLE_PROMPT_TEMPLATES } from "./prompt-templates";

export interface LovableSkillOption {
  id: string;
  name: string;
  description?: string | null;
  prompt: string;
  icon?: string | null;
  tags?: string[];
}

interface LovableComposerTemplatePickerProps {
  open: boolean;
  input: string;
  skills: LovableSkillOption[];
  selectedKey?: string | null;
  onSelectSkill: (prompt: string, skillId: string) => void;
  onSelectTemplate: (prompt: string) => void;
  onExploreDesignDirections?: () => void;
}

export function LovableComposerTemplatePicker({
  open,
  input,
  skills,
  selectedKey,
  onSelectSkill,
  onSelectTemplate,
  onExploreDesignDirections,
}: LovableComposerTemplatePickerProps) {
  const slashQuery = input.startsWith("/") ? input.slice(1).toLowerCase().trim() : "";
  const matchedSkills = skills.filter(
    (s) =>
      !slashQuery ||
      s.name.toLowerCase().includes(slashQuery) ||
      (s.description ?? "").toLowerCase().includes(slashQuery) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(slashQuery)),
  );
  const showTemplates = input === "/" || !input.startsWith("/");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
            <span className="text-[11px] font-semibold text-muted-foreground">Prompt templates & skills</span>
            <span className="text-[10px] text-muted-foreground/50">Type / to open · Esc to close</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {matchedSkills.length > 0 && (
              <div>
                <div className="px-3 py-1 bg-violet-500/5 border-b border-border/40 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-violet-400" />
                  <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Skills</span>
                </div>
                {matchedSkills.slice(0, 8).map((skill) => (
                  <button
                    key={skill.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelectSkill(skill.prompt, skill.id);
                    }}
                    className={`w-full flex items-start gap-2.5 px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors ${
                      selectedKey === `skill:${skill.id}` ? "bg-accent text-accent-foreground" : ""
                    }`}
                  >
                    <span className="text-lg leading-none shrink-0 mt-0.5">{skill.icon ?? "✨"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{skill.name}</div>
                      {skill.description && (
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5">{skill.description}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showTemplates &&
              LOVABLE_PROMPT_TEMPLATES.map((group) => (
                <div key={group.category}>
                  <div className="px-3 py-1 bg-muted/30 border-b border-border/40">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.category}
                    </span>
                  </div>
                  {group.prompts.map((prompt) => {
                    if (prompt === LOVABLE_DESIGN_DIRECTIONS_SLASH_KEY) {
                      return (
                        <button
                          key={prompt}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            onExploreDesignDirections?.();
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors ${
                            selectedKey === `tpl:${prompt}` ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          <Palette className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                          <span className="truncate">Explore 3 design directions</span>
                        </button>
                      );
                    }
                    return (
                      <button
                        key={prompt}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          onSelectTemplate(prompt);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors ${
                          selectedKey === `tpl:${prompt}` ? "bg-accent text-accent-foreground" : ""
                        }`}
                      >
                        <span className="text-muted-foreground/40 font-mono text-[10px] shrink-0">/</span>
                        <span className="truncate">{prompt}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
