"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { MessageSquarePlus, X, ChevronDown, ChevronUp, Pin, Pencil, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface Annotation {
  id: string;
  x: number;          // percent of container width
  y: number;          // percent of container height
  text: string;
  color: string;
  createdAt: string;
  resolved: boolean;
}

interface PreviewAnnotationsProps {
  projectId: string;
  enabled: boolean;
  containerRef?: React.RefObject<HTMLElement>;
}

const COLORS = [
  { id: "yellow", bg: "bg-yellow-400", border: "border-yellow-500", text: "text-yellow-900", dot: "#facc15" },
  { id: "blue",   bg: "bg-blue-400",   border: "border-blue-500",   text: "text-blue-900",   dot: "#60a5fa" },
  { id: "green",  bg: "bg-green-400",  border: "border-green-500",  text: "text-green-900",  dot: "#4ade80" },
  { id: "rose",   bg: "bg-rose-400",   border: "border-rose-500",   text: "text-rose-900",   dot: "#fb7185" },
  { id: "purple", bg: "bg-purple-400", border: "border-purple-500", text: "text-purple-900", dot: "#c084fc" },
];

const STORAGE_KEY = (projectId: string) => `lifemark_annotations_${projectId}`;

function loadAnnotations(projectId: string): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(projectId));
    return raw ? (JSON.parse(raw) as Annotation[]) : [];
  } catch {
    return [];
  }
}

function saveAnnotations(projectId: string, annotations: Annotation[]) {
  try {
    localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(annotations));
  } catch { /* ignore */ }
}

interface NewAnnotationDraft {
  x: number;
  y: number;
  text: string;
  colorId: string;
}

export function PreviewAnnotations({ projectId, enabled }: PreviewAnnotationsProps) {
  const [annotations, setAnnotations] = useState<Annotation[]>(() => loadAnnotations(projectId));
  const [draft, setDraft] = useState<NewAnnotationDraft | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const draftInputRef = useRef<HTMLTextAreaElement>(null);

  // Persist on change
  useEffect(() => {
    saveAnnotations(projectId, annotations);
  }, [annotations, projectId]);

  // Focus draft textarea
  useEffect(() => {
    if (draft) draftInputRef.current?.focus();
  }, [draft]);

  // Overlay click handler — captures position without relying on iframe event bubbling
  const handleOverlayClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabled) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-annotation]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDraft({ x, y, text: "", colorId: "yellow" });
    setExpandedId(null);
  }, [enabled]);

  function commitDraft() {
    if (!draft || !draft.text.trim()) { setDraft(null); return; }
    const newAnnotation: Annotation = {
      id: `ann_${Date.now()}`,
      x: draft.x,
      y: draft.y,
      text: draft.text.trim(),
      color: draft.colorId,
      createdAt: new Date().toISOString(),
      resolved: false,
    };
    setAnnotations((prev) => [...prev, newAnnotation]);
    setDraft(null);
  }

  function deleteAnnotation(id: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function resolveAnnotation(id: string) {
    setAnnotations((prev) => prev.map((a) => a.id === id ? { ...a, resolved: !a.resolved } : a));
  }

  function startEdit(ann: Annotation) {
    setEditingId(ann.id);
    setEditText(ann.text);
    setExpandedId(ann.id);
  }

  function commitEdit() {
    if (!editingId) return;
    setAnnotations((prev) => prev.map((a) => a.id === editingId ? { ...a, text: editText.trim() || a.text } : a));
    setEditingId(null);
  }

  const visible = annotations.filter((a) => showResolved || !a.resolved);

  if (!enabled && annotations.length === 0) return null;

  return (
    <>
      {/* Transparent click-capture overlay — intercepts clicks over the iframe */}
      {enabled && (
        <div
          className="absolute inset-0 z-40"
          style={{ cursor: "crosshair" }}
          onClick={handleOverlayClick}
        />
      )}
      {/* Annotation pins */}
      {visible.map((ann) => {
        const colorDef = COLORS.find((c) => c.id === ann.color) ?? COLORS[0];
        const isExpanded = expandedId === ann.id;
        const isEditing = editingId === ann.id;

        return (
          <div
            key={ann.id}
            data-annotation="true"
            className="absolute z-50"
            style={{ left: `${ann.x}%`, top: `${ann.y}%`, transform: "translate(-50%, -100%)" }}
          >
            {/* Sticky note card (when expanded) */}
            {isExpanded && (
              <div
                className={`absolute bottom-full mb-1 left-1/2 -translate-x-1/2 w-52 rounded-xl border shadow-xl ${colorDef.bg} ${colorDef.border} border-2`}
              >
                {/* Color picker row */}
                <div className="flex items-center gap-1 px-2 pt-2 pb-1">
                  {COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setAnnotations((prev) => prev.map((a) => a.id === ann.id ? { ...a, color: c.id } : a))}
                      className={`w-4 h-4 rounded-full border-2 transition-transform ${ann.color === c.id ? "scale-125 border-white" : "border-transparent"}`}
                      style={{ background: c.dot }}
                    />
                  ))}
                  <div className="flex-1" />
                  <button onClick={() => resolveAnnotation(ann.id)} title={ann.resolved ? "Unresolve" : "Resolve"} className="opacity-60 hover:opacity-100">
                    <Check className={`w-3.5 h-3.5 ${ann.resolved ? "text-green-700" : colorDef.text}`} />
                  </button>
                  <button onClick={() => startEdit(ann)} className="opacity-60 hover:opacity-100">
                    <Pencil className={`w-3.5 h-3.5 ${colorDef.text}`} />
                  </button>
                  <button onClick={() => deleteAnnotation(ann.id)} className="opacity-60 hover:opacity-100">
                    <Trash2 className={`w-3.5 h-3.5 ${colorDef.text}`} />
                  </button>
                  <button onClick={() => setExpandedId(null)} className="opacity-60 hover:opacity-100">
                    <X className={`w-3.5 h-3.5 ${colorDef.text}`} />
                  </button>
                </div>

                {/* Text content */}
                <div className={`px-2 pb-2 ${colorDef.text}`}>
                  {isEditing ? (
                    <div className="space-y-1">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) commitEdit(); if (e.key === "Escape") setEditingId(null); }}
                        rows={3}
                        autoFocus
                        className={`w-full resize-none text-xs rounded border ${colorDef.border} bg-white/40 p-1 ${colorDef.text} placeholder:opacity-50 focus:outline-none`}
                      />
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditingId(null)} className="text-[10px] opacity-60">Cancel</button>
                        <button onClick={commitEdit} className="text-[10px] font-medium">Save</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{ann.text}</p>
                  )}
                </div>

                <div className={`px-2 pb-2 text-[9px] opacity-50 ${colorDef.text}`}>
                  {new Date(ann.createdAt).toLocaleString()}
                  {ann.resolved && " · resolved"}
                </div>
              </div>
            )}

            {/* Pin dot */}
            <button
              onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : ann.id); setEditingId(null); }}
              className="relative group"
              style={{ filter: ann.resolved ? "grayscale(0.6) opacity(0.5)" : undefined }}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center transition-transform group-hover:scale-110 ${colorDef.bg}`}
              >
                <Pin className="w-3 h-3 text-white" strokeWidth={2.5} />
              </div>
              {/* Tail */}
              <div className="absolute left-1/2 -translate-x-1/2 top-full w-0.5 h-2" style={{ background: COLORS.find((c) => c.id === ann.color)?.dot ?? "#facc15" }} />
            </button>
          </div>
        );
      })}

      {/* Draft placement popup */}
      {draft && (
        <div
          data-annotation="true"
          className="absolute z-50 w-56"
          style={{ left: `${draft.x}%`, top: `${draft.y}%`, transform: "translate(-50%, -100%)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={`rounded-xl border-2 shadow-xl ${COLORS.find((c) => c.id === draft.colorId)?.bg ?? "bg-yellow-400"} ${COLORS.find((c) => c.id === draft.colorId)?.border ?? "border-yellow-500"}`}>
            {/* Color picker */}
            <div className="flex items-center gap-1.5 px-2 pt-2">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setDraft((d) => d ? { ...d, colorId: c.id } : null)}
                  className={`w-4 h-4 rounded-full border-2 transition-transform ${draft.colorId === c.id ? "scale-125 border-white" : "border-transparent"}`}
                  style={{ background: c.dot }}
                />
              ))}
              <div className="flex-1" />
              <button onClick={() => setDraft(null)} className="opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-2 space-y-1.5">
              <textarea
                ref={draftInputRef}
                value={draft.text}
                onChange={(e) => setDraft((d) => d ? { ...d, text: e.target.value } : null)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) commitDraft(); if (e.key === "Escape") setDraft(null); }}
                placeholder="Add a note… (⌘↵ to save)"
                rows={3}
                className="w-full resize-none text-xs rounded border border-white/40 bg-white/40 p-1.5 focus:outline-none placeholder:opacity-60"
              />
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" className="flex-1 h-6 text-[10px]" onClick={() => setDraft(null)}>Cancel</Button>
                <Button size="sm" className="flex-1 h-6 text-[10px]" onClick={commitDraft}>Pin note</Button>
              </div>
            </div>
          </div>
          {/* Tail */}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0.5 h-2" style={{ background: COLORS.find((c) => c.id === draft.colorId)?.dot ?? "#facc15" }} />
        </div>
      )}

      {/* Controls bar (when annotations enabled) */}
      {enabled && (
        <div
          data-annotation="true"
          className="absolute bottom-3 right-3 z-50 flex items-center gap-1.5 bg-background/90 backdrop-blur border border-border rounded-full px-2.5 py-1 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <MessageSquarePlus className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">Click anywhere to annotate</span>
          {annotations.some((a) => a.resolved) && (
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-1"
            >
              {showResolved ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showResolved ? "Hide resolved" : `+${annotations.filter((a) => a.resolved).length} resolved`}
            </button>
          )}
          {annotations.length > 0 && (
            <span className="text-[10px] font-medium text-foreground bg-muted px-1.5 py-0.5 rounded-full ml-0.5">
              {annotations.filter((a) => !a.resolved).length}
            </span>
          )}
        </div>
      )}
    </>
  );
}
