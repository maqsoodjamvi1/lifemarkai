
import { AnimatePresence,motion } from "framer-motion";
import { Loader2,Sparkles } from "lucide-react";

export interface LovableSaveSkillDraft {
  sourceMessageId: string;
  name: string;
  description: string;
  prompt: string;
}

interface LovableComposerSaveSkillModalProps {
  draft: LovableSaveSkillDraft | null;
  saving: boolean;
  onDraftChange: (draft: LovableSaveSkillDraft) => void;
  onClose: () => void;
  onSave: () => void;
}

export function LovableComposerSaveSkillModal({
  draft,
  saving,
  onDraftChange,
  onClose,
  onSave,
}: LovableComposerSaveSkillModalProps) {
  return (
    <AnimatePresence>
      {draft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !saving && onClose()}
        >
          <motion.div
            initial={{ scale: 0.95, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 8 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
          >
            <div className="px-5 pt-4 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold">Save as skill</h3>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Reuse this answer as a named playbook. It will be auto-attached when future prompts match its
                description.
              </p>
            </div>
            <div className="px-5 py-3 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Name</label>
                <input
                  value={draft.name}
                  onChange={(e) => onDraftChange({ ...draft, name: e.target.value })}
                  placeholder="e.g. Add Stripe checkout"
                  className="w-full h-8 px-2.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  maxLength={120}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  Description <span className="text-muted-foreground/50">(used for matching)</span>
                </label>
                <textarea
                  value={draft.description}
                  onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
                  rows={2}
                  placeholder="A short summary of when this skill applies"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                  maxLength={500}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Playbook body</label>
                <textarea
                  value={draft.prompt}
                  onChange={(e) => onDraftChange({ ...draft, prompt: e.target.value })}
                  rows={8}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                />
                <p className="text-[10px] text-muted-foreground/70 mt-1">
                  This will be appended to the AI system prompt whenever the skill matches.
                </p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/10">
              <button
                onClick={onClose}
                disabled={saving}
                className="h-8 px-3 text-xs rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving || !draft.name.trim() || !draft.prompt.trim()}
                className="h-8 px-3 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Save skill
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
