"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Zap, Plus, Pencil, Trash2, Save, X, Loader2,
  Search, Tag, ChevronDown, ChevronUp, BookOpen, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import type { User } from "@supabase/supabase-js";

interface Skill {
  id: string;
  name: string;
  description?: string | null;
  prompt: string;
  icon: string;
  tags: string[];
  use_count: number;
  created_at: string;
}

interface BuiltinSkill {
  id: string;
  name: string;
  description?: string | null;
  prompt: string;
  icon: string;
  tags: string[];
  sort_order: number;
}

interface WorkspaceSkillsPageProps {
  user: User;
}

const EMOJI_OPTIONS = ["⚡", "🌙", "💳", "🔍", "🔐", "📊", "📱", "🔔", "💀", "✅", "⌨️", "🎨", "🚀", "🛡️", "📝", "🧩", "🔧", "💡", "🎯", "🌐"];

function SkillForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<Skill>;
  onSave: (data: { name: string; description: string; prompt: string; icon: string; tags: string[] }) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "⚡");
  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join(", "));
  const [showEmoji, setShowEmoji] = useState(false);

  function handleSubmit() {
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    onSave({ name, description, prompt, icon, tags });
  }

  return (
    <div className="space-y-4 p-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
      <div className="flex items-center gap-3">
        {/* Icon picker */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="w-10 h-10 rounded-lg border border-border text-xl flex items-center justify-center hover:border-violet-500/40 transition-colors"
          >
            {icon}
          </button>
          <AnimatePresence>
            {showEmoji && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute top-11 left-0 z-20 bg-popover border border-border rounded-xl p-2 grid grid-cols-5 gap-1 shadow-lg"
              >
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { setIcon(e); setShowEmoji(false); }}
                    className="w-8 h-8 text-lg rounded hover:bg-accent flex items-center justify-center transition-colors"
                  >
                    {e}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex-1">
          <Input
            placeholder="Skill name (e.g. Add Dark Mode)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 text-sm font-medium"
          />
        </div>
      </div>

      <Input
        placeholder="Short description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="h-9 text-sm"
      />

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Prompt instructions</label>
        <Textarea
          placeholder="Write the AI instructions for this skill. Be specific about what should be added, what patterns to follow, and what the result should look like."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[120px] text-sm font-mono resize-y"
        />
        <p className="text-[10px] text-muted-foreground">{prompt.length} chars</p>
      </div>

      <Input
        placeholder="Tags (comma-separated, e.g. ui, payments, auth)"
        value={tagsRaw}
        onChange={(e) => setTagsRaw(e.target.value)}
        className="h-9 text-sm"
      />

      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          disabled={saving || !name.trim() || !prompt.trim()}
          onClick={handleSubmit}
          className="gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Save skill"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1.5">
          <X className="w-3.5 h-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function WorkspaceSkillsPage({ user: _user }: WorkspaceSkillsPageProps) {
  const { toast } = useToast();

  const [customSkills, setCustomSkills] = useState<Skill[]>([]);
  const [builtinSkills, setBuiltinSkills] = useState<BuiltinSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showBuiltin, setShowBuiltin] = useState(true);
  const [expandedBuiltin, setExpandedBuiltin] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json() as { custom: Skill[]; builtin: BuiltinSkill[] };
        setCustomSkills(data.custom ?? []);
        setBuiltinSkills(data.builtin ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate(data: { name: string; description: string; prompt: string; icon: string; tags: string[] }) {
    setSaving(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json() as Skill & { error?: string };
      if (!res.ok) {
        toast({ title: "Error", description: result.error ?? "Failed to create skill", variant: "destructive" });
        return;
      }
      setCustomSkills((prev) => [result, ...prev]);
      setShowCreate(false);
      toast({ title: "Skill created", description: `"${result.name}" is ready to use in any project.` });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, data: { name: string; description: string; prompt: string; icon: string; tags: string[] }) {
    setSaving(true);
    try {
      const res = await fetch(`/api/skills?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json() as Skill & { error?: string };
      if (!res.ok) {
        toast({ title: "Error", description: result.error ?? "Failed to update skill", variant: "destructive" });
        return;
      }
      setCustomSkills((prev) => prev.map((s) => s.id === id ? result : s));
      setEditingId(null);
      toast({ title: "Skill updated" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(skill: Skill) {
    setDeleting(skill.id);
    try {
      await fetch(`/api/skills?id=${skill.id}`, { method: "DELETE" });
      setCustomSkills((prev) => prev.filter((s) => s.id !== skill.id));
      toast({ title: "Skill deleted", description: `"${skill.name}" has been removed.` });
    } finally {
      setDeleting(null);
    }
  }

  const filteredCustom = customSkills.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase()) ||
    s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredBuiltin = builtinSkills.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase()) ||
    s.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <Zap className="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Workspace Skills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable AI instruction playbooks. Apply any skill from the chat panel in any project
            to instantly run a defined set of AI instructions — no copy-pasting needed.
          </p>
        </div>
      </div>

      {/* Search + Create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button
          size="sm"
          onClick={() => { setShowCreate(true); setEditingId(null); }}
          disabled={showCreate}
          className="gap-1.5 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New skill
        </Button>
      </div>

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <SkillForm
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              saving={saving}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom skills */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Your skills</h2>
          {customSkills.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{customSkills.length}</span>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredCustom.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {search ? "No skills match your search." : "No custom skills yet."}
            </p>
            {!search && (
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs mx-auto">
                Create a skill to save a set of AI instructions you use often, then apply it instantly from any project&apos;s chat.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {filteredCustom.map((skill) => (
                <motion.div
                  key={skill.id}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="rounded-xl border border-border bg-card"
                >
                  {editingId === skill.id ? (
                    <div className="p-3">
                      <SkillForm
                        initial={skill}
                        onSave={(data) => handleUpdate(skill.id, data)}
                        onCancel={() => setEditingId(null)}
                        saving={saving}
                      />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-3 group">
                      <span className="text-2xl shrink-0 mt-0.5">{skill.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{skill.name}</p>
                          {skill.use_count > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                              used {skill.use_count}×
                            </span>
                          )}
                        </div>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{skill.description}</p>
                        )}
                        {skill.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            <Tag className="w-2.5 h-2.5 text-muted-foreground/50" />
                            {skill.tags.map((tag) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setEditingId(skill.id)}
                          title="Edit skill"
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-destructive"
                          onClick={() => void handleDelete(skill)}
                          disabled={deleting === skill.id}
                          title="Delete skill"
                        >
                          {deleting === skill.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Trash2 className="w-3 h-3" />
                          }
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Built-in skills */}
      <div className="space-y-3">
        <button
          className="flex items-center gap-2 w-full text-left"
          onClick={() => setShowBuiltin((v) => !v)}
        >
          <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
          <h2 className="text-sm font-semibold flex-1">Built-in skills</h2>
          <span className="text-xs text-muted-foreground">{builtinSkills.length} included</span>
          {showBuiltin
            ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
          }
        </button>

        <AnimatePresence>
          {showBuiltin && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-2 pb-2">
                {filteredBuiltin.map((skill) => (
                  <div key={skill.id} className="rounded-xl border border-border/60 bg-muted/20">
                    <button
                      className="flex items-start gap-3 p-3 w-full text-left"
                      onClick={() => setExpandedBuiltin((prev) => prev === skill.id ? null : skill.id)}
                    >
                      <span className="text-2xl shrink-0 mt-0.5">{skill.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{skill.name}</p>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                        )}
                        {skill.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {skill.tags.map((tag) => (
                              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {expandedBuiltin === skill.id
                        ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                        : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                      }
                    </button>
                    <AnimatePresence>
                      {expandedBuiltin === skill.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 pt-0">
                            <div className="rounded-lg bg-muted/40 border border-border/40 p-3">
                              <p className="text-[11px] font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {skill.prompt}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <p className="text-sm font-medium text-amber-300">How to use skills</p>
        </div>
        <p className="text-xs text-amber-200/70 leading-relaxed">
          In any project&apos;s chat panel, click the <strong className="text-amber-200">⚡ Skills</strong> button in the toolbar to open the skill picker.
          Select a skill and it will be injected as your next message — the AI will execute those instructions immediately.
          Skills save you from re-typing the same instructions across projects.
        </p>
      </div>
    </div>
  );
}
