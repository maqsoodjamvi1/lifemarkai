
import { ChevronsDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ClarifyQuestion {
  id: string;
  question: string;
  type: "text" | "choice";
  /** Semantic kind — drives visual option rendering (Lovable parity). */
  kind?: "palette" | "typography" | "layout" | "structure" | "database" | "general";
  options?: Array<string | { label: string; description?: string; value?: string }>;
  /** Let users select several compatible capabilities in one decision. */
  multiple?: boolean;
  answer: string;
}

function optionDetails(option: NonNullable<ClarifyQuestion["options"]>[number]) {
  if (typeof option === "string") return { label: option, value: option, description: "" };
  return {
    label: option.label,
    value: option.value || option.label,
    description: option.description || "",
  };
}

function selectedAnswers(answer: string): string[] {
  return answer.split(" | ").map((value) => value.trim()).filter(Boolean);
}

export interface ClarifySession {
  originalPrompt: string;
  questions: ClarifyQuestion[];
}

interface LovableClarifySessionCardProps {
  session: ClarifySession;
  onDismiss: () => void;
  onUpdateQuestion: (questionId: string, answer: string) => void;
  onBuildNow: (enrichedPrompt: string) => void;
  onSkipAndBuild: (originalPrompt: string) => void;
}

/** Pull hex swatches out of option labels like "Cherry Blossom (#F8C8DC, #B03052)". */
function parseSwatches(option: string): { label: string; hexes: string[] } {
  const hexes = option.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const label = option.replace(/\s*\(([^)]*#[^)]*)\)\s*/g, "").trim();
  return { label, hexes: hexes.slice(0, 4) };
}

/** Grey-block skeleton thumbnails for layout options (Lovable-style). */
const LAYOUT_SKELETONS: Array<Array<{ x: number; y: number; w: number; h: number }>> = [
  // Hero left + sidebar
  [{ x: 8, y: 6, w: 44, h: 22 }, { x: 56, y: 6, w: 22, h: 10 }, { x: 56, y: 18, w: 22, h: 10 }, { x: 8, y: 31, w: 14, h: 9 }, { x: 25, y: 31, w: 14, h: 9 }, { x: 42, y: 31, w: 14, h: 9 }],
  // Full-width banner + 3 columns
  [{ x: 8, y: 6, w: 70, h: 14 }, { x: 8, y: 24, w: 21, h: 16 }, { x: 32, y: 24, w: 21, h: 16 }, { x: 56, y: 24, w: 22, h: 16 }],
  // Magazine: stacked rows + rail
  [{ x: 8, y: 6, w: 30, h: 12 }, { x: 41, y: 6, w: 18, h: 8 }, { x: 41, y: 16, w: 18, h: 8 }, { x: 8, y: 21, w: 30, h: 8 }, { x: 8, y: 32, w: 22, h: 8 }, { x: 33, y: 32, w: 26, h: 8 }],
  // Split rows
  [{ x: 8, y: 6, w: 34, h: 10 }, { x: 45, y: 6, w: 33, h: 10 }, { x: 8, y: 19, w: 70, h: 8 }, { x: 8, y: 30, w: 20, h: 9 }, { x: 31, y: 30, w: 47, h: 9 }],
];

function LayoutThumb({ index }: { index: number }) {
  const blocks = LAYOUT_SKELETONS[index % LAYOUT_SKELETONS.length];
  return (
    <svg viewBox="0 0 86 46" className="w-full h-auto" aria-hidden>
      {blocks.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="2"
          className={i === 0 ? "fill-neutral-400/70" : "fill-neutral-300/70"} />
      ))}
    </svg>
  );
}

/** One question rendered as a single row: label + inline answer controls. */
function ClarifyQuestionRow({
  q,
  onUpdateQuestion,
}: {
  q: ClarifyQuestion;
  onUpdateQuestion: (questionId: string, answer: string) => void;
}) {
  const isCustomAnswer = q.answer.trim() !== "" && !(q.options ?? []).some((option) => {
    const { label, value } = optionDetails(option);
    return selectedAnswers(q.answer).some((answer) => answer === value || answer === label || answer === parseSwatches(label).label);
  });

  return (
    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap py-1 [scrollbar-width:thin]" title={q.question}>
      <span className="shrink-0 max-w-[40%] truncate text-xs font-medium text-foreground" title={q.question}>
        {q.question}
      </span>
      {q.type === "choice" && (q.options?.length ?? 0) > 0 && (
        <span className="flex items-center gap-1.5 shrink-0">
          {(q.options ?? []).map((opt) => {
            const details = optionDetails(opt);
            const { label, hexes } = parseSwatches(details.label);
            const selected = selectedAnswers(q.answer).some((answer) => answer === details.value || answer === label);
            return (
              <button
                key={details.value}
                type="button"
                title={details.description || label}
                onClick={() => {
                  if (!q.multiple) {
                    onUpdateQuestion(q.id, details.value);
                    return;
                  }
                  const current = selectedAnswers(q.answer);
                  const next = selected
                    ? current.filter((answer) => answer !== details.value && answer !== label)
                    : [...current, details.value];
                  onUpdateQuestion(q.id, next.join(" | "));
                }}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted/30 text-foreground hover:border-foreground/40",
                )}
              >
                {hexes.length > 0 && (
                  <span className="flex -space-x-1">
                    {hexes.slice(0, 2).map((h) => (
                      <span key={h} className="w-2.5 h-2.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: h }} />
                    ))}
                  </span>
                )}
                {label}
              </button>
            );
          })}
        </span>
      )}
      <input
        type="text"
        value={isCustomAnswer || q.type === "text" ? q.answer : ""}
        onChange={(e) => onUpdateQuestion(q.id, e.target.value)}
        placeholder="Other…"
        className="shrink-0 w-24 text-[11px] bg-background border border-border rounded-full px-2.5 py-1 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-[#1F55F1]/50"
      />
    </div>
  );
}

/**
 * Lovable-parity clarify form: every question rendered as ONE compact row
 * (question label + inline pill options + a slim "Other…" input) in a single
 * scrollable list, instead of a one-question-per-step wizard — answer
 * everything at a glance, then Build.
 */
export function LovableClarifySessionCard({
  session,
  onDismiss,
  onBuildNow,
  onUpdateQuestion,
  onSkipAndBuild,
}: LovableClarifySessionCardProps) {
  const submit = () => {
    const answersBlock = session.questions
      .filter((x) => x.answer.trim())
      .map((x) => `- ${x.question}: ${x.answer}`)
      .join("\n");
    onBuildNow(
      answersBlock
        ? `${session.originalPrompt}\n\nDesign & requirements decisions (apply throughout the build):\n${answersBlock}`
        : session.originalPrompt,
    );
  };

  return (
    <div
      data-card-focusable
      tabIndex={0}
      className="mx-3 mb-2 max-w-md rounded-2xl border border-border bg-background shadow-surface-md overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[#1F55F1]/30"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-border/60">
        <span className="text-sm font-medium text-foreground">A few quick questions</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Collapse questions"
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronsDownUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body — every question, one line each */}
      <div className="px-4 py-2.5 divide-y divide-border/50 max-h-80 overflow-y-auto">
        {session.questions.map((q) => (
          <ClarifyQuestionRow key={q.id} q={q} onUpdateQuestion={onUpdateQuestion} />
        ))}
      </div>

      {/* Footer — Skip all, Build */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border/60">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {session.questions.filter((x) => x.answer.trim()).length}/{session.questions.length} answered
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onSkipAndBuild(session.originalPrompt)}
            className="h-7 text-xs text-foreground/70 hover:text-foreground"
          >
            Skip all
          </Button>
          <Button
            size="sm"
            onClick={submit}
            className="h-7 px-3.5 text-xs font-semibold rounded-full bg-[#1F55F1] hover:bg-[#1142DE] text-white"
          >
            Build
          </Button>
        </div>
      </div>
    </div>
  );
}
