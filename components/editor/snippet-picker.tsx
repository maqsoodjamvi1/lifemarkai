"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookMarked, Search, Plus, Trash2, Edit2, Check, X,
  Globe, Lock, TrendingUp, Clock, Tag, Loader2, Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Snippet {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  is_public: boolean;
  use_count: number;
  created_at: string;
}

interface SnippetPickerProps {
  currentUserId: string;
  onInsert: (content: string) => void;
  onClose: () => void;
}

// ─── Curated starter snippets (shown when library is empty) ──────────────────

const STARTER_SNIPPETS: Omit<Snippet, "id" | "user_id" | "created_at"> [] = [
  { title: "Add dark mode toggle", content: "Add a dark mode toggle button to the header. Use Tailwind's dark: variant and store the preference in localStorage.", tags: ["ui", "theme"], is_public: false, use_count: 0 },
  { title: "Add Stripe checkout", content: "Add a Stripe checkout flow for a $9/month subscription. Include a pricing card with a 'Subscribe' button that redirects to Stripe Checkout.", tags: ["payments", "stripe"], is_public: false, use_count: 0 },
  { title: "Add user authentication", content: "Add email/password authentication with login, signup, and logout pages using Supabase Auth.", tags: ["auth", "supabase"], is_public: false, use_count: 0 },
  { title: "Add a data table", content: "Add a sortable, filterable data table with pagination. Use TanStack Table (react-table) with a clean shadcn/ui style.", tags: ["ui", "data"], is_public: false, use_count: 0 },
  { title: "Add loading skeleton", content: "Add skeleton loading states to all data-fetching components. Match the exact layout of the loaded content.", tags: ["ui", "loading"], is_public: false, use_count: 0 },
  { title: "Add form validation", content: "Add form validation with React Hook Form and Zod. Show inline error messages under each field.", tags: ["forms", "validation"], is_public: false, use_count: 0 },
  { title: "Add toast notifications", content: "Add toast notifications for all async actions (save, delete, error). Use the existing toast system.", tags: ["ui", "notifications"], is_public: false, use_count: 0 },
  { title: "Responsive mobile layout", content: "Make the layout fully responsive for mobile screens. Use Tailwind breakpoints (sm:, md:, lg:) and ensure all text and buttons are touch-friendly.", tags: ["mobile", "responsive"], is_public: false, use_count: 0 },
];

// ─── Tag colours ─────────────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  ui: "bg-blue-500/20 text-blue-300",
  payments: "bg-emerald-500/20 text-emerald-300",
  auth: "bg-purple-500/20 text-purple-300",
  supabase: "bg-green-500/20 text-green-300",
  data: "bg-amber-500/20 text-amber-300",
  forms: "bg-orange-500/20 text-orange-300",
  mobile: "bg-pink-500/20 text-pink-300",
  loading: "bg-slate-500/20 text-slate-300",
  theme: "bg-indigo-500/20 text-indigo-300",
  notifications: "bg-red-500/20 text-red-300",
  responsive: "bg-teal-500/20 text-teal-300",
  validation: "bg-yellow-500/20 text-yellow-300",
};

function tagColor(tag: string) {
  return TAG_COLORS[tag] ?? "bg-white/10 text-slate-300";
}

// ─── Snippet Card ─────────────────────────────────────────────────────────────

function SnippetCard({
  snippet,
  isOwner,
  onInsert,
  onDelete,
  onEdit,
}: {
  snippet: Snippet;
  isOwner: boolean;
  onInsert: (s: Snippet) => void;
  onDelete: (id: string) => void;
  onEdit: (s: Snippet) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative p-3 rounded-lg border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.1] cursor-pointer transition-all"
      onClick={() => onInsert(snippet)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-white truncate">{snippet.title}</p>
            {snippet.is_public && (
              <Globe className="w-3 h-3 text-emerald-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
            {snippet.content}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {snippet.tags.slice(0, 3).map((t) => (
              <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tagColor(t)}`}>
                {t}
              </span>
            ))}
            {snippet.use_count > 0 && (
              <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
                <TrendingUp className="w-2.5 h-2.5" />{snippet.use_count}
              </span>
            )}
          </div>
        </div>

        {/* Actions shown on hover */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {isOwner && (
                <>
                  <button
                    onClick={() => onEdit(snippet)}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onDelete(snippet.id)}
                    className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ─── Create / Edit Form ───────────────────────────────────────────────────────

function SnippetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Snippet>;
  onSave: (data: { title: string; content: string; tags: string[]; is_public: boolean }) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tagInput, setTagInput] = useState((initial?.tags ?? []).join(", "));
  const [isPublic, setIsPublic] = useState(initial?.is_public ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    const tags = tagInput.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
    try {
      await onSave({ title: title.trim(), content: content.trim(), tags, is_public: isPublic });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/[0.05] space-y-3"
    >
      <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
        {initial?.id ? "Edit snippet" : "New snippet"}
      </p>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Add dark mode toggle)"
        maxLength={100}
        className="h-8 text-sm bg-white/[0.03] border-white/[0.08]"
      />

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="The prompt text to insert into chat..."
        maxLength={4000}
        rows={4}
        className="text-sm bg-white/[0.03] border-white/[0.08] resize-none font-mono text-xs"
      />

      <Input
        value={tagInput}
        onChange={(e) => setTagInput(e.target.value)}
        placeholder="Tags (comma-separated): ui, auth, payments"
        className="h-8 text-sm bg-white/[0.03] border-white/[0.08]"
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          <div>
            <p className="text-xs font-medium text-slate-300">Share publicly</p>
            <p className="text-[10px] text-slate-500">Visible to all LifemarkAI users</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
            <X className="w-3 h-3 mr-1" /> Cancel
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-blue-600 hover:bg-blue-500 text-white"
            onClick={handleSave}
            disabled={saving || !title.trim() || !content.trim()}
          >
            {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SnippetPicker({ currentUserId, onInsert, onClose }: SnippetPickerProps) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "mine" | "public">("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Snippet | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ scope });
      if (q) params.set("q", q);
      const res = await fetch(`/api/snippets?${params}`);
      if (res.ok) setSnippets(await res.json());
    } finally {
      setLoading(false);
    }
  }, [q, scope]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 80); }, []);

  const handleInsert = async (s: Snippet) => {
    onInsert(s.content);
    // Fire-and-forget use count increment
    fetch(`/api/snippets/${s.id}`, { method: "POST" }).catch(() => {});
    onClose();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/snippets/${id}`, { method: "DELETE" });
    setSnippets((prev) => prev.filter((s) => s.id !== id));
    toast({ title: "Snippet deleted" });
  };

  const handleCreate = async (data: { title: string; content: string; tags: string[]; is_public: boolean }) => {
    const res = await fetch("/api/snippets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      toast({ title: "Failed to save snippet", variant: "destructive" });
      return;
    }
    const newSnippet = await res.json();
    setSnippets((prev) => [newSnippet, ...prev]);
    setCreating(false);
    toast({ title: "Snippet saved" });
  };

  const handleEdit = async (data: { title: string; content: string; tags: string[]; is_public: boolean }) => {
    if (!editing) return;
    const res = await fetch(`/api/snippets/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      toast({ title: "Failed to update snippet", variant: "destructive" });
      return;
    }
    const updated = await res.json();
    setSnippets((prev) => prev.map((s) => s.id === updated.id ? updated : s));
    setEditing(null);
    toast({ title: "Snippet updated" });
  };

  // Show starters if no snippets
  const showStarters = !loading && snippets.length === 0 && !q;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 8 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full left-0 right-0 mb-2 z-50 bg-[#0f1117] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
      style={{ maxHeight: "420px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <BookMarked className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-slate-300">Prompt Library</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setCreating(true); setEditing(null); }}
            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
          >
            <Plus className="w-3 h-3" /> New
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: "372px" }}>
        <div className="p-2 space-y-2">
          {/* Search + scope */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search snippets…"
                className="w-full pl-7 pr-3 h-7 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div className="flex rounded-lg border border-white/[0.06] overflow-hidden text-[10px]">
              {(["all", "mine", "public"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-2 py-1 capitalize transition-colors ${scope === s ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Create form */}
          <AnimatePresence mode="wait">
            {creating && (
              <SnippetForm
                onSave={handleCreate}
                onCancel={() => setCreating(false)}
              />
            )}
            {editing && (
              <SnippetForm
                initial={editing}
                onSave={handleEdit}
                onCancel={() => setEditing(null)}
              />
            )}
          </AnimatePresence>

          {/* Snippet list */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
            </div>
          ) : showStarters ? (
            <div className="space-y-1">
              <p className="text-[10px] text-slate-600 px-1 pb-1">
                Starter snippets — click to insert, or save your own with <strong className="text-slate-500">New</strong>
              </p>
              {STARTER_SNIPPETS.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => onInsert(s.content)}
                  className="p-2.5 rounded-lg border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-200 group-hover:text-white">{s.title}</p>
                    <div className="flex gap-1">
                      {s.tags.slice(0, 2).map((t) => (
                        <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${tagColor(t)}`}>{t}</span>
                      ))}
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-1 line-clamp-1">{s.content}</p>
                </motion.div>
              ))}
            </div>
          ) : snippets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BookMarked className="w-6 h-6 text-slate-700 mb-2" />
              <p className="text-xs text-slate-500">No snippets found</p>
              {q && <p className="text-[10px] text-slate-600 mt-0.5">Try a different search</p>}
            </div>
          ) : (
            <AnimatePresence>
              {snippets.map((s) => (
                <SnippetCard
                  key={s.id}
                  snippet={s}
                  isOwner={s.user_id === currentUserId}
                  onInsert={handleInsert}
                  onDelete={handleDelete}
                  onEdit={(sn) => { setEditing(sn); setCreating(false); }}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </motion.div>
  );
}
