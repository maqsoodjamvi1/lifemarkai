
/**
 * Lovable-parity "Fix error" special message.
 *
 * Lovable dump (inside the standard user bubble):
 *   <div class="w-full max-w-[300px]">
 *     <div class="special-message">Fix error</div>
 *     <div data-closed>
 *       <div style="overflow:hidden;height:0px">
 *         <pre class="text-tertiary-pulse max-h-[300px] overflow-x-auto overflow-y-auto
 *                     text-base whitespace-pre-wrap md:text-sm">…raw error…</pre>
 *       </div>
 *       <button aria-expanded="false" class="… h-7 w-7 …"><chevron/></button>
 *     </div>
 *   </div>
 *
 * Instead of dumping the whole healing prompt into the bubble, fix requests
 * render as a compact title ("Fix error" / "Fix build error") with the raw
 * error text collapsed behind a chevron toggle.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface LovableFixMessageMeta {
  title: string;
  detail: string;
}

/** Extract the contents of the first ``` fence, or null. */
function firstFence(content: string): string | null {
  const m = content.match(/```[a-z]*\n?([\s\S]*?)```/);
  return m ? m[1].trim() : null;
}

/**
 * Recognise chat messages that are really fix requests / fix notifications
 * and reduce them to Lovable's special-message shape. Returns null for
 * ordinary messages.
 */
export function parseLovableFixMessage(content: string | null | undefined): LovableFixMessageMeta | null {
  const c = (content ?? "").trim();
  if (!c) return null;

  // Healing prompt sent by the preview overlay ("Try to fix") — one-click send.
  if (c.startsWith("Fix the preview/runtime errors")) {
    const detail = firstFence(c) ?? c.split("\n").slice(1).join("\n").trim();
    const isBuild = /\[(bundler|build)\]|Failed to compile|SyntaxError|Transform failed/i.test(c);
    return { title: isBuild ? "Fix build error" : "Fix error", detail };
  }

  // Composer-prefilled runtime fix ("Fix with AI" banner → input).
  if (c.startsWith("Fix this runtime error:")) {
    return { title: "Fix error", detail: c.replace(/^Fix this runtime error:\s*/, "").trim() };
  }

  // Auto-fix progress notification (assistant-side).
  const auto = c.match(/^🔧 \*\*Auto-fixing error\*\* \(attempt (\d+)\/(\d+)\)/);
  if (auto) {
    return {
      title: `Fix error (attempt ${auto[1]}/${auto[2]})`,
      detail: firstFence(c) ?? "",
    };
  }

  // "Try to fix all" security sweep.
  if (/^Fix all \d+ security issues?/.test(c)) {
    return { title: "Fix security issues", detail: c };
  }

  return null;
}

/** Collapsible special message — title + hidden raw error + chevron toggle. */
export function LovableFixErrorMessage({ title, detail }: LovableFixMessageMeta) {
  const [open, setOpen] = useState(false);
  const hasDetail = detail.trim().length > 0;

  return (
    <div className="w-full max-w-[300px]" data-special-message="fix-error">
      <div className="special-message text-base md:text-sm font-medium text-[var(--fg-primary)]">
        {title}
      </div>
      {hasDetail && (
        <div data-closed={open ? undefined : ""}>
          <div
            style={{ overflow: "hidden", height: open ? "auto" : 0 }}
            aria-hidden={!open}
          >
            <pre className="text-[var(--fg-tertiary)] max-h-[300px] overflow-x-auto overflow-y-auto text-base whitespace-pre-wrap md:text-sm mt-1">
              {detail}
            </pre>
          </div>
          <button
            type="button"
            data-button=""
            aria-expanded={open}
            aria-label={open ? "Hide error" : "Show error"}
            onClick={() => setOpen((v) => !v)}
            className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-2)] text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] transition-opacity active:opacity-80"
          >
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      )}
    </div>
  );
}
