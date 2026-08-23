/**
 * PlanTree with AstRiskBadge summary strip (gap-closure UX).
 */
import { AstRiskBadge } from "./ast-risk-badge";
import { PlanTreeBase as BasePlanTree, type ConsoleState } from "./console-core";

export function PlanTreeWithRisk({ state }: { state: ConsoleState }) {
  if (state.epics.length === 0) {
    return <BasePlanTree state={state} />;
  }
  const riskTasks = state.epics.flatMap((e) =>
    (e.tasks ?? []).filter((t) => typeof t.risk === "number"),
  );
  return (
    <div className="space-y-3">
      <BasePlanTree state={state} />
      <div className="flex flex-wrap gap-1.5 rounded-md border border-border bg-muted/20 px-2 py-1.5">
        <span className="text-[10px] font-medium text-muted-foreground">AST risk</span>
        {riskTasks.map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 text-[10px]">
            <span className="max-w-[8rem] truncate text-muted-foreground" title={t.title}>
              {t.title}
            </span>
            <AstRiskBadge risk={t.risk} source={t.risk >= 60 ? "mixed" : "llm"} />
          </span>
        ))}
        {riskTasks.length === 0 && (
          <span className="text-[10px] text-muted-foreground">no risk scores yet</span>
        )}
      </div>
    </div>
  );
}
