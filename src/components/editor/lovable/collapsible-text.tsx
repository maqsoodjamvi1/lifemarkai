
import { useState } from "react";
import { ChevronDown,ChevronUp } from "lucide-react";

interface LovableCollapsibleTextProps {
  text: string;
  /** Characters before collapse (default 480). */
  threshold?: number;
  children?: React.ReactNode;
}

/** Collapses long user/assistant prose with Show more / Show less. */
export function LovableCollapsibleText({
  text,
  threshold = 480,
  children,
}: LovableCollapsibleTextProps) {
  const [expanded, setExpanded] = useState(false);
  const needsCollapse = text.length > threshold;

  if (!needsCollapse) {
    return <>{children ?? <span className="whitespace-pre-wrap break-words">{text}</span>}</>;
  }

  const preview = text.slice(0, threshold).trimEnd() + "…";

  return (
    <div>
      {children ? (
        <div className={expanded ? undefined : "max-h-[9.5rem] overflow-hidden relative"}>
          {children}
          {!expanded && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--bg-secondary-pulse)] to-transparent" />
          )}
        </div>
      ) : (
        <span className="whitespace-pre-wrap break-words">
          {expanded ? text : preview}
        </span>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] text-violet-400/90 hover:text-violet-300 transition-colors"
      >
        {expanded ? (
          <>
            Show less <ChevronUp className="w-3 h-3" />
          </>
        ) : (
          <>
            Show more <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>
    </div>
  );
}
