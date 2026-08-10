
import { useMemo,useState } from "react";
import { ChevronLeft,ChevronRight,ChevronsDownUp } from "lucide-react";
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

/**
 * Lovable-parity clarify wizard: ONE question per step with visual options
 * (layout thumbnails, palette swatches), ‹ › navigation, "Write your own…",
 * Skip all, and a final Review-answers step before submitting.
 */
export function LovableClarifySessionCard({
  session,
  onDismiss,
  onUpdateQuestion,
  onBuildNow,
  onSkipAndBuild,
}: LovableClarifySessionCardProps) {
  const total = session.questions.length;
  const [step, setStep] = useState(0); // total === review step
  const reviewing = step >= total;
  const q = reviewing ? null : session.questions[step];

  const isCustomAnswer = useMemo(
    () => !!q && q.answer.trim() !== "" && !(q.options ?? []).some((option) => {
      const { label, value } = optionDetails(option);
      return selectedAnswers(q.answer).some((answer) => answer === value || answer === label || answer === parseSwatches(label).label);
    }),
    [q],
  );

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
      {/* Header — the question itself, Lovable-style */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-3 border-b border-border/60">
        <span className="text-sm font-medium text-foreground">
          {reviewing ? "Review answers" : q?.question}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Collapse questions"
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronsDownUp className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      {reviewing ? (
        <div className="px-4 py-3 space-y-3">
          {session.questions.map((x) => (
            <div key={x.id} className="space-y-0.5">
              <p className="text-xs text-muted-foreground">{x.question}</p>
              <p className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-foreground/70 inline-block" />
                {x.answer.trim() ? parseSwatches(x.answer).label || x.answer : "Skipped"}
              </p>
            </div>
          ))}
        </div>
      ) : q ? (
        <div className="px-4 py-3 space-y-3">
          {q.type === "choice" && (q.options?.length ?? 0) > 0 && (
            <div className={cn("grid gap-2", q.kind === "layout" ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
              {(q.options ?? []).map((opt, oi) => {
                const details = optionDetails(opt);
                const { label, hexes } = parseSwatches(details.label);
                const selected = selectedAnswers(q.answer).some((answer) => answer === details.value || answer === label);
                return (
                  <button
                    key={details.value}
                    type="button"
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
                      "rounded-xl border text-left transition-all flex gap-2.5",
                      q.kind === "layout" ? "p-2 bg-muted/40" : "px-3 py-2.5 bg-muted/30",
                      selected
                        ? "border-foreground ring-1 ring-foreground"
                        : "border-border hover:border-foreground/40",
                    )}
                  >
                    {q.multiple && (
                      <span className={cn(
                        "mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center text-[10px] font-bold",
                        selected ? "bg-[#1F55F1] border-[#1F55F1] text-white" : "border-border bg-background",
                      )}>{selected ? "✓" : ""}</span>
                    )}
                    <span className="min-w-0 flex-1">
                    {q.kind === "layout" && <LayoutThumb index={oi} />}
                    <span className={cn("flex items-center gap-2", q.kind === "layout" && "mt-1.5")}>
                      {hexes.length > 0 && (
                        <span className="flex -space-x-1">
                          {hexes.map((h) => (
                            <span key={h} className="w-3.5 h-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: h }} />
                          ))}
                        </span>
                      )}
                      <span className="text-xs font-medium text-foreground">{label}</span>
                    </span>
                    {details.description && (
                      <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{details.description}</span>
                    )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <input
            type="text"
            value={isCustomAnswer || q.type === "text" ? q.answer : ""}
            onChange={(e) => onUpdateQuestion(q.id, e.target.value)}
            placeholder="Write your own…"
            className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-[#1F55F1]/50"
          />
        </div>
      ) : null}

      {/* Footer — ‹ › nav, Skip all, Review/Submit */}
      <div className="flex items-center gap-1 px-3 py-2.5 border-t border-border/60">
        <button
          type="button"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          aria-label="Previous question"
          className="w-7 h-7 rounded-full flex items-center justify-center text-foreground/70 hover:bg-muted disabled:opacity-30"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={reviewing}
          onClick={() => setStep((s) => Math.min(total, s + 1))}
          aria-label="Next question"
          className="w-7 h-7 rounded-full flex items-center justify-center text-foreground/70 hover:bg-muted disabled:opacity-30"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {!reviewing && total > 1 && (
          <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
            {step + 1}/{total}
          </span>
        )}
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
            onClick={() => (reviewing ? submit() : setStep((s) => Math.min(total, s + 1)))}
            className="h-7 px-3.5 text-xs font-semibold rounded-full bg-[#1F55F1] hover:bg-[#1142DE] text-white"
          >
            {reviewing ? "Submit" : step === total - 1 ? "Review" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
