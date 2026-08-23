/**
 * Shows structural risk from Rust impact analysis on a task chip.
 */
export function AstRiskBadge({
  risk,
  source = "llm",
}: {
  risk: number;
  source?: "llm" | "ast" | "mixed";
}) {
  const level = risk >= 70 ? "high" : risk >= 40 ? "med" : "low";
  const color =
    level === "high"
      ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
      : level === "med"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
        : "border-border bg-muted/30 text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${color}`}
      title={
        source === "ast"
          ? "Risk raised by Rust AST impact analysis"
          : source === "mixed"
            ? "Planner risk adjusted with AST impact"
            : "Planner-estimated risk"
      }
    >
      risk {Math.round(risk)}
      {source !== "llm" && <span className="opacity-70">· ast</span>}
    </span>
  );
}
