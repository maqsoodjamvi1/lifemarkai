import type { OnboardingStep } from "@/lib/editor/onboarding-flow";

export function OnboardingStepper({ steps }: { steps: OnboardingStep[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[10px]">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/50">→</span>}
          <span
            className={
              s.done
                ? "rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300"
                : s.active
                  ? "rounded bg-primary/15 px-1.5 py-0.5 font-medium text-primary"
                  : "rounded bg-muted/40 px-1.5 py-0.5 text-muted-foreground"
            }
          >
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
