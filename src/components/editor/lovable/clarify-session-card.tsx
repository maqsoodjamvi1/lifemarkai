
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isClarifyDeferredChoice, type ClarifyInterviewQuestion } from "@/lib/ai/chat/clarify-turn";

export type ClarifyQuestion = ClarifyInterviewQuestion;

export interface ClarifySession {
  originalPrompt: string;
  questions: ClarifyQuestion[];
  currentIndex: number;
  openEnded?: boolean;
  awaitingDetails?: boolean;
}

export interface ClarificationOption {
  label: string;
  description?: string;
  value?: string;
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

/** Pull hex swatches out of option labels like "Cherry Blossom (#F8C8DC, #B03052)". */
function parseSwatches(option: string): { label: string; hexes: string[] } {
  const hexes = option.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const label = option.replace(/\s*\(([^)]*#[^)]*)\)\s*/g, "").trim();
  return { label, hexes: hexes.slice(0, 4) };
}

const LAYOUT_SKELETONS: Array<Array<{ x: number; y: number; w: number; h: number }>> = [
  [{ x: 8, y: 6, w: 44, h: 22 }, { x: 56, y: 6, w: 22, h: 10 }, { x: 56, y: 18, w: 22, h: 10 }, { x: 8, y: 31, w: 14, h: 9 }, { x: 25, y: 31, w: 14, h: 9 }, { x: 42, y: 31, w: 14, h: 9 }],
  [{ x: 8, y: 6, w: 70, h: 14 }, { x: 8, y: 24, w: 21, h: 16 }, { x: 32, y: 24, w: 21, h: 16 }, { x: 56, y: 24, w: 22, h: 16 }],
  [{ x: 8, y: 6, w: 30, h: 12 }, { x: 41, y: 6, w: 18, h: 8 }, { x: 41, y: 16, w: 18, h: 8 }, { x: 8, y: 21, w: 30, h: 8 }, { x: 8, y: 32, w: 22, h: 8 }, { x: 33, y: 32, w: 26, h: 8 }],
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

interface LovableClarifyTurnCardProps {
  question: ClarifyQuestion;
  step: number;
  total: number;
  isFirst: boolean;
  ack?: string;
  embedded?: boolean;
  chipsOnly?: boolean;
  awaitingDetails?: boolean;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
  onSkipAll: () => void;
}

/**
 * One question in the chat timeline — Lovable style. Tap a chip or type in the
 * composer; the next question appears after this one is answered.
 */
export function LovableClarifyTurnCard({
  question,
  ack,
  embedded = false,
  chipsOnly = false,
  awaitingDetails = false,
  onAnswer,
  onSkip,
}: LovableClarifyTurnCardProps) {
  const visual = question.kind === "palette" || question.kind === "layout";
  const [multiDraft, setMultiDraft] = useState(question.answer);
  useEffect(() => {
    setMultiDraft(question.answer);
  }, [question.id, question.answer]);

  return (
    <div className={embedded ? "w-full" : "mx-auto mb-3 w-full max-w-3xl px-4"}>
      <div className="flex flex-col items-start gap-2">
        {!chipsOnly && ack ? (
          <p className="text-sm text-foreground">{ack}</p>
        ) : null}
        {!chipsOnly ? (
          <p className="text-sm font-medium text-foreground">{question.question}</p>
        ) : null}
        {question.type === "choice" && (question.options?.length ?? 0) > 0 ? (
          <div className={cn("flex flex-wrap gap-1.5", visual && "w-full")}>
            {(question.options ?? []).map((opt, index) => {
              const details = optionDetails(opt);
              const { label, hexes } = parseSwatches(details.label);
              const selected =
                (awaitingDetails && isClarifyDeferredChoice(question, details.value)) ||
                selectedAnswers(question.multiple ? multiDraft : question.answer).some(
                  (answer) => answer === details.value || answer === label,
                );
              if (question.kind === "layout") {
                return (
                  <button
                    key={details.value}
                    type="button"
                    title={details.description || label}
                    onClick={() => onAnswer(details.value)}
                    className={cn(
                      "w-[calc(50%-0.25rem)] rounded-xl border p-2 text-left transition-colors",
                      selected
                        ? "border-foreground bg-foreground/5"
                        : "border-border hover:border-foreground/40",
                    )}
                  >
                    <LayoutThumb index={index} />
                    <span className="mt-1.5 block text-[11px] font-medium">{label}</span>
                  </button>
                );
              }
              return (
                <button
                  key={details.value}
                  type="button"
                  title={details.description || label}
                  onClick={() => {
                    if (!question.multiple) {
                      onAnswer(details.value);
                      return;
                    }
                    const current = selectedAnswers(multiDraft);
                    const next = selected
                      ? current.filter((answer) => answer !== details.value && answer !== label)
                      : [...current, details.value];
                    setMultiDraft(next.join(" | "));
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-[9px] py-1 text-sm transition-opacity hover:opacity-80",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-transparent bg-[var(--bg-translucent,var(--bg-muted))] text-[var(--fg-primary)]",
                  )}
                >
                  {hexes.length > 0 && (
                    <span className="flex -space-x-1">
                      {hexes.slice(0, 3).map((h) => (
                        <span
                          key={h}
                          className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                          style={{ backgroundColor: h }}
                        />
                      ))}
                    </span>
                  )}
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
        {question.multiple ? (
          <p className="text-[11px] text-muted-foreground">
            Pick one or more, then Continue — or type your own answer below.
          </p>
        ) : awaitingDetails ? (
          <p className="text-[11px] text-muted-foreground">Describe it below, then press Enter.</p>
        ) : null}
        <div className="flex items-center gap-2">
          {question.multiple ? (
            <Button
              size="sm"
              onClick={() => onAnswer(multiDraft.trim() || "skipped")}
              disabled={!multiDraft.trim()}
              className="h-7 px-3 text-xs font-semibold rounded-full bg-[#1F55F1] hover:bg-[#1142DE] text-white"
            >
              Continue
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onSkip}
            className="h-7 px-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
