
interface LovableVerificationCardProps {
  passed?: boolean;
  engine?: string;
  errors?: string[];
}

export function LovableVerificationCard({ passed, engine, errors = [] }: LovableVerificationCardProps) {
  const ok = passed !== false;
  return (
    <div
      className={`w-full mt-1 rounded-xl border overflow-hidden ${
        ok ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="px-3 py-2 text-xs font-semibold">
        {ok ? "Preview verified" : "Preview check — fixes applied"}
        {engine ? <span className="text-muted-foreground font-normal ml-1">({engine})</span> : null}
      </div>
      {errors.length > 0 && (
        <div className="px-3 pb-2 space-y-0.5">
          {errors.map((e) => (
            <div key={e} className="text-[10px] text-muted-foreground flex gap-1.5">
              <span className="text-amber-400">!</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
