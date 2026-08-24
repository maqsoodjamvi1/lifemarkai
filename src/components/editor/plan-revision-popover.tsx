/**
 * Plan-mode inline revision (Lovable parity, Aug 3 2026).
 *
 * Flow: the user highlights part of a rendered plan → a popover anchors to the
 * selection → they describe the change → the AI rewrites JUST that excerpt →
 * the result renders as a word-level diff (struck-through removals, highlighted
 * additions) → Apply splices it back into the plan source, or Discard drops it.
 *
 * Revising an excerpt rather than regenerating the whole plan is the point:
 * it keeps the rest of the plan byte-identical, so approving a revision is a
 * local decision instead of a re-read of the entire document.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { diffStats, diffWords } from "@/lib/editor/plan-diff";

export interface PlanRevisionTarget {
  /** Verbatim slice of the plan source that will be replaced. */
  excerpt: string;
  /** Viewport position of the selection, for anchoring the popover. */
  rect: { top: number; left: number; width: number; height: number };
}

export interface PlanRevisionPopoverProps {
  target: PlanRevisionTarget;
  projectId: string;
  /** Full plan markdown — sent as context so the rewrite fits its surroundings. */
  planContext: string;
  onApply: (revised: string) => void;
  onClose: () => void;
}

/** Rendered word-level diff. Additions and removals are also marked up
 *  semantically (<ins>/<del>) so the meaning survives without color. */
export function PlanDiffPreview({ before, after }: { before: string; after: string }) {
  const segments = useMemo(() => diffWords(before, after), [before, after]);
  const stats = useMemo(() => diffStats(segments), [segments]);

  return (
    <div className="space-y-1.5">
      <div className="rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs leading-relaxed max-h-52 overflow-auto whitespace-pre-wrap">
        {segments.map((seg, i) => {
          if (seg.op === "equal") return <span key={i}>{seg.text}</span>;
          if (seg.op === "delete") {
            return (
              <del
                key={i}
                className="bg-red-500/15 text-red-400/90 line-through decoration-red-400/60"
              >
                {seg.text}
              </del>
            );
          }
          return (
            <ins key={i} className="bg-emerald-500/15 text-emerald-300 no-underline">
              {seg.text}
            </ins>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="text-emerald-400">+{stats.added} added</span>
        <span className="text-red-400">−{stats.removed} removed</span>
        <span>{stats.unchanged} unchanged</span>
      </div>
    </div>
  );
}

export function PlanRevisionPopover({
  target,
  projectId,
  planContext,
  onApply,
  onClose,
}: PlanRevisionPopoverProps) {
  const [instruction, setInstruction] = useState("");
  const [revised, setRevised] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  // Clamp into the viewport — a selection near the right or bottom edge would
  // otherwise anchor the panel off-screen.
  const width = 340;
  const left = Math.min(Math.max(8, target.rect.left), window.innerWidth - width - 8);
  const top = Math.min(target.rect.top + target.rect.height + 8, window.innerHeight - 280);

  async function requestRevision() {
    const text = instruction.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          projectId,
          mode: "plan",
          systemPrompt:
            "You revise ONE excerpt of an implementation plan.\n" +
            "Return ONLY the revised excerpt as markdown — no preamble, no fences, no commentary.\n" +
            "Preserve the excerpt's formatting level (if it is a bullet, stay a bullet; if it is a heading, stay a heading).\n" +
            "Keep it the same order of length unless the instruction explicitly asks to expand or shorten.\n" +
            "Never write code — this is planning only.",
          messages: [
            {
              role: "user",
              content:
                `Plan (context only, do not rewrite):\n"""\n${planContext.slice(0, 6000)}\n"""\n\n` +
                `Excerpt to revise:\n"""\n${target.excerpt}\n"""\n\n` +
                `Instruction: ${text}\n\nRevised excerpt:`,
            },
          ],
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Revision failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += decoder.decode(value, { stream: true });
        setRevised(cleanExcerpt(out));
      }
      const final = cleanExcerpt(out);
      if (!final) throw new Error("Empty revision");
      setRevised(final);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Revision failed");
      setRevised(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="fixed z-50 rounded-xl border border-border bg-popover shadow-2xl"
      style={{ left, top, width }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-xs font-medium">Revise this part</span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-2">
        <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground max-h-20 overflow-auto whitespace-pre-wrap">
          {target.excerpt}
        </div>

        {revised === null ? (
          <>
            <Textarea
              ref={inputRef}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void requestRevision();
                }
                if (e.key === "Escape") onClose();
              }}
              placeholder="e.g. use Postgres instead of Redis, and mention the migration"
              className="min-h-[64px] text-xs resize-none"
              disabled={busy}
            />
            {error && <p className="text-[10px] text-destructive">{error}</p>}
            <div className="flex justify-end gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={!instruction.trim() || busy}
                onClick={() => void requestRevision()}
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Revise
              </Button>
            </div>
          </>
        ) : (
          <>
            <PlanDiffPreview before={target.excerpt} after={revised} />
            {error && <p className="text-[10px] text-destructive">{error}</p>}
            <div className="flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setRevised(null);
                  setError(null);
                }}
                disabled={busy}
              >
                Try again
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={busy}
                onClick={() => onApply(revised)}
              >
                <Check className="w-3 h-3" />
                Apply
              </Button>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Strip what models add around a bare excerpt: markdown fences, a leading
 * "Revised excerpt:" echo, and wrapping quotes. Without this the fence markers
 * end up spliced into the plan source.
 */
export function cleanExcerpt(raw: string): string {
  let out = raw.trim();
  out = out.replace(/^(?:revised\s+excerpt|revision)\s*:\s*/i, "");
  const fence = out.match(/^```[\w]*\n([\s\S]*?)\n?```$/);
  if (fence) out = fence[1];
  out = out.replace(/^"""\n?([\s\S]*?)\n?"""$/, "$1");
  return out.trim();
}
