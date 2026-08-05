/**
 * Injected into Vite preview (WebContainer iframe) to capture runtime +
 * bundler errors and post them to the parent editor for self-healing loops.
 *
 * Network/backend fetch failures are treated as non-fatal (see
 * isNetworkFetchError) so a preview never freezes over a Supabase/API request
 * that fails against an unprovisioned backend.
 */

/**
 * Network / backend fetch failures. An app querying Supabase (or any API)
 * against an unprovisioned/placeholder backend throws "TypeError: Failed to
 * fetch" (Chrome), "Load failed" (Safari), "NetworkError…" (Firefox), or a
 * net::ERR_* / ERR_CONNECTION_* string. These are RUNTIME DATA conditions, not
 * code crashes — the app itself still renders — so they must never freeze the
 * preview with the blocking "Preview paused" overlay.
 */
export function isNetworkFetchError(message: string): boolean {
  return /failed to fetch|network\s?error|network request failed|load failed|fetch failed|net::err_|err_connection|err_name_not_resolved|err_internet_disconnected|typeerror:\s*load failed/i.test(
    message,
  );
}

/**
 * Browser-extension injects (Trust Wallet, MetaMask, etc.) throw inside
 * `chrome-extension://…/inpage.js` and show up as unhandled rejections in the
 * preview iframe. Those are not app bugs — never freeze the preview over them.
 */
export function isBrowserExtensionError(
  message: string,
  extras?: { filename?: string; stack?: string },
): boolean {
  const blob = [message, extras?.filename ?? "", extras?.stack ?? ""].join("\n");
  if (
    /chrome-extension:\/\/|moz-extension:\/\/|safari-web-extension:\/\/|safari-extension:\/\/|webkit-masked-url:/i.test(
      blob,
    )
  ) {
    return true;
  }
  // `inpage.js` on its own is enough.
  //
  // It used to also require a wallet word (ethereum/metamask/solana/…) in the
  // same blob, and that extra condition is what let a real case through. A
  // multi-chain wallet extension patches the scheduler — `postMessage`,
  // `setImmediate` — so React's own work loop runs THROUGH it, and the stack
  // reads:
  //
  //     at U (index-<hash>.js:2:9832)
  //     at de (index-<hash>.js:2:10209)
  //     at run (inpage.js:1:1898085)
  //     at runIfPresent (inpage.js:1:1898212)
  //     at onGlobalMessage (inpage.js:1:1897412)
  //
  // No wallet word anywhere — just React frames sitting on top of the
  // extension's shim. `inpage.js` is not a filename any Vite or React app
  // produces; it is the conventional name for an extension's page-context
  // inject. Seeing it at all means the page is not running alone.
  if (/\binpage\.js\b/i.test(blob)) return true;
  // The provider adapters those extensions register, in case the frame that
  // named the file was trimmed out of a truncated stack.
  if (
    /\b(Ethereum|Solana|Cosmos|Tron|Ton|Bitcoin|BinanceWeb3)(Adapter|Provider)\b|\bProvidersManager\b|IN_PAGE_CHANNEL_NODE_ID/i.test(
      blob,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * React's production error codes for "hydration was abandoned".
 *
 * A minified React error carries no component, no file and no line — the whole
 * point of minification is that the message is a number. There is nothing in
 * it for the auto-fixer to act on, so putting one into the healing loop can
 * only produce a guess, and guesses on a hydration error cost credits and
 * change files at random.
 *
 *   418  hydration failed, the initial UI does not match the server
 *   422  error while hydrating this Suspense boundary
 *   423  error while hydrating; the whole root switches to client rendering
 *
 * 425 (text content does not match) is deliberately EXCLUDED: it is the one
 * hydration code that reliably indicates an application bug — a timestamp or a
 * random value rendered during SSR — and the fixer handles those well.
 *
 * Development builds are unaffected: previews run `vite dev`, where React
 * emits the full message with a component stack, and those still come through
 * unless they are document-level (see isDocumentHydrationMismatch).
 */
export function isMinifiedReactHydrationError(message: string): boolean {
  return /(?:Minified React error|invariant=)\s*#?\s*(418|422|423)\b/i.test(message);
}

/** Skip React/console noise that is not actionable for the healing loop. */
export function isNoisePreviewError(
  message: string,
  extras?: { filename?: string; stack?: string },
): boolean {
  const m = message.trim();
  if (!m) return true;
  if (m === "{}" || m === "[]" || m === "[object Object]") return true;
  if (/^Unhandled promise rejection:\s*(\{\}|undefined|null)\s*$/i.test(m)) return true;
  if (m.length < 4 && !/error|fail/i.test(m)) return true;
  // Backend/network fetch failures don't crash the app — surface them in the
  // console panel, never in the freezing overlay.
  if (isNetworkFetchError(m)) return true;
  if (isBrowserExtensionError(m, extras)) return true;
  // "Preview root is empty" is a HEURISTIC guess (root has no children after a
  // deadline), not a real error. It false-positives on every slow cold mount,
  // warm-sandbox reconnect, and HMR blank — showing a scary "app crashed"
  // freeze when nothing is wrong. A genuine mount crash throws a real
  // runtime/bundler error, which is still caught above. So never let the
  // empty-root heuristic ALONE freeze the preview.
  if (/preview root is empty/i.test(m)) return true;
  if (isDocumentHydrationMismatch(m)) return true;
  if (isMinifiedReactHydrationError(m)) return true;
  return false;
}

/**
 * A hydration mismatch reported against the DOCUMENT shell — <html>, <head>,
 * <body>, #document — rather than against page content.
 *
 * These are not application bugs, and the AI cannot fix them, because nothing
 * in the app's render caused them: something mutated the document between the
 * server's HTML arriving and React hydrating it. Browser extensions are the
 * usual suspect in the wild (password managers and grammar checkers add
 * attributes to <body>) — and for a long time WE were the suspect here. The
 * visual-edit bridge appended a <style> into <head> at parse time, which broke
 * every server-rendered preview on every load.
 *
 * Letting these reach the healing loop was expensive in the most literal
 * sense. The stack names the customer's __root.tsx, so the auto-fixer spent
 * real credits rewriting a file that was never wrong, failed, and tried again.
 *
 * Deliberately NARROW. A hydration mismatch inside page CONTENT — a div, a
 * paragraph, text differing between server and client — IS an application bug
 * (Date.now() during render, reading localStorage while server-rendering) and
 * the AI fixes those well. Those still come through untouched.
 */
export function isDocumentHydrationMismatch(message: string): boolean {
  const m = message.trim();

  // Family 1: "Expected server HTML to contain a matching <CHILD> in <PARENT>".
  // Note this one does NOT contain the word "hydration" — gating on that was
  // the first thing I got wrong here, and it is the message the customer
  // actually saw most.
  //
  // Only the CHILD decides. `<div> in <body>` is a real application bug (the
  // app rendered a div the server didn't); `<head> in <html>` is the document
  // shell being mutated from outside React.
  if (/expected server html to contain a matching/i.test(m)) {
    const explicit = /matching\s+<\s*([a-z#][\w#-]*)\s*>\s+in\s+</i.exec(m);
    if (explicit) return /^(html|head|body)$/i.test(explicit[1]!);
    // The console often logs React's raw format string with its arguments
    // appended instead of substituted:
    //   "…a matching <%s> in <%s>.%s head html"
    // The arguments arrive in order, so the first is still the child.
    const positional = /%s(?:\.%s)?\s+([a-z#][\w#-]*)\s+([a-z#][\w#-]*)/i.exec(m);
    if (positional) return /^(html|head|body)$/i.test(positional[1]!);
    return false;
  }

  // Family 2: hydration was abandoned and the document was rebuilt. React only
  // says this about the document itself.
  if (/server html was replaced with client content/i.test(m)) return true;

  // Family 3: the generic companion error. React emits this alongside the
  // specific warning above for EVERY hydration failure, including real
  // content-level ones — but it carries no location, so on its own it can
  // never tell the fixer what to change. Previews run Vite dev with the
  // development React build, where the specific warning is always emitted too,
  // so suppressing this one loses no signal for genuine bugs while removing
  // the message that drove the loop.
  if (/hydration failed because the initial ui does not match/i.test(m)) return true;

  return false;
}

/** Preview rendered undefined components (bad import / export mismatch). */
export function isMissingComponentError(message: string): boolean {
  return /missing component|failed to resolve|export mismatch|undefined component/i.test(message);
}

export const PREVIEW_ERROR_BRIDGE_SCRIPT = `(function() {
  if (window.parent === window) return;

  var sent = {};
  function isNoise(msg, filename, stack) {
    var m = String(msg || "").trim();
    if (!m || m === "{}" || m === "[]" || m === "[object Object]") return true;
    if (m.length < 4 && !/error|fail/i.test(m)) return true;
    // Backend/network fetch failures (Supabase against a placeholder backend,
    // offline API, etc.) are runtime data conditions, not code crashes — never
    // freeze the preview over them.
    if (/failed to fetch|network\\s?error|network request failed|load failed|fetch failed|net::err_|err_connection|err_name_not_resolved|err_internet_disconnected/i.test(m)) return true;
    // Wallet / browser extensions inject inpage.js into the iframe and throw;
    // ignore chrome-extension:// (and cousins) so they never pause preview.
    var blob = m + "\\n" + String(filename || "") + "\\n" + String(stack || "");
    if (/chrome-extension:\\/\\/|moz-extension:\\/\\/|safari-web-extension:\\/\\/|safari-extension:\\/\\/|webkit-masked-url:/i.test(blob)) return true;
    if (/\\binpage\\.js\\b/i.test(blob) && /emit|ethereum|wallet|metamask|solana|web3/i.test(blob)) return true;
    return false;
  }
  function dedupe(msg) {
    if (sent[msg]) return false;
    sent[msg] = 1;
    return true;
  }

  function emit(kind, message, extra) {
    extra = extra || {};
    if (isNoise(message, extra.filename, extra.stack) || !dedupe(kind + ":" + message)) return;
    try {
      window.parent.postMessage({
        source: "lifemark-preview-errors",
        type: "preview-error",
        kind: kind,
        message: String(message),
        extra: extra,
        url: location.href,
        timestamp: Date.now()
      }, "*");
    } catch (e) {}
  }

  window.addEventListener("error", function(e) {
    emit("runtime", e.message || "Unknown error", {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error && e.error.stack ? String(e.error.stack) : ""
    });
  });

  window.addEventListener("unhandledrejection", function(e) {
    var msg = e.reason && (e.reason.message || String(e.reason)) || "Unhandled rejection";
    emit("promise", msg, {
      stack: e.reason && e.reason.stack ? String(e.reason.stack) : ""
    });
  });

  var _err = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var text = args.map(function(a){ return typeof a === "string" ? a : (a && a.message) || ""; }).join(" ");
    if (/\\[vite\\]|Failed to compile|Pre-transform error|SyntaxError|Transform failed/i.test(text)) {
      emit("bundler", text, { args: args.slice(0, 3) });
    }
    return _err.apply(console, args);
  };

  // Empty-root detection. This ONLY means "app crashed on mount" if the tunnel
  // actually served the app and React still never rendered. On a cold Modal
  // sandbox the first paint can land at 15-20s (dep optimization + slow tunnel),
  // so a short window false-positives with a PHANTOM "crashed" banner that then
  // never clears. Fix: (1) MutationObserver clears instantly the moment #root
  // gets content, (2) a generous 30s window before declaring a crash, and
  // (3) if a LATE mount happens after we reported, emit a CLEAR so the parent
  // dismisses the phantom error.
  (function() {
    var emitted = false;
    var settled = false;

    function hasContent() {
      var r = document.getElementById("root");
      return !!(r && r.innerHTML.trim().length > 0);
    }
    function clearEmptyRoot() {
      if (!emitted) return;
      emitted = false;
      try {
        window.parent.postMessage({
          source: "lifemark-preview-errors",
          type: "preview-error-clear",
          kind: "empty-root",
          url: location.href,
          timestamp: Date.now()
        }, "*");
      } catch (e) {}
    }
    function markSettled() {
      if (settled) return;
      settled = true;
      clearEmptyRoot();
    }

    if (typeof MutationObserver !== "undefined") {
      try {
        var mo = new MutationObserver(function() {
          if (hasContent()) { markSettled(); mo.disconnect(); }
        });
        var rootEl = document.getElementById("root");
        if (rootEl) mo.observe(rootEl, { childList: true, subtree: true });
      } catch (e) {}
    }

    var deadline = Date.now() + 30000;   // give cold sandboxes room to paint
    var hardStop = Date.now() + 90000;   // keep watching for a very-late mount
    function poll() {
      if (settled) return;
      if (hasContent()) { markSettled(); return; }
      if (Date.now() >= deadline) {
        // Only a real crash if the app document fully loaded and root is still
        // empty. If the tunnel was unreachable, other signals (or no signal)
        // handle it — don't cry "crashed" on a transient blank.
        if (!emitted && document.readyState === "complete") {
          emitted = true;
          emit("empty-root", "Preview root is empty — app may have crashed during mount", {});
        }
        if (Date.now() < hardStop) setTimeout(poll, 3000);
        return;
      }
      setTimeout(poll, 2000);
    }
    setTimeout(poll, 3000);
  })();

  window.parent.postMessage({ source: "lifemark-preview-errors", type: "preview-error-ready" }, "*");
})();`;

export type PreviewErrorKind = "runtime" | "promise" | "bundler" | "empty-root" | "console";

export interface PreviewRuntimeError {
  kind: PreviewErrorKind;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  url?: string;
  timestamp: number;
}

export interface PreviewErrorReport {
  errors: PreviewRuntimeError[];
  formatted: string;
  hasFatal: boolean;
}

const BUNDLER_RE = /\[vite\]|failed to compile|pre-transform|syntaxerror|transform failed|unexpected token/i;

export function isBundlerError(message: string): boolean {
  return BUNDLER_RE.test(message);
}

export function formatErrorsForHealing(errors: PreviewRuntimeError[]): string {
  const actionable = errors.filter((e) => !isNoisePreviewError(e.message));
  if (actionable.length === 0) return "";
  return actionable
    .map((e, i) => {
      const loc = e.filename ? ` (${e.filename}:${e.lineno ?? "?"})` : "";
      const stack = compactStack(e.stack);
      return `${i + 1}. [${e.kind}] ${e.message}${loc}${stack ? `\n   stack: ${stack}` : ""}`;
    })
    .join("\n");
}

function compactStack(stack: string | undefined): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^at\s+/i.test(line))
    .filter((line) => !/react-dom|react\.production|scheduler/i.test(line))
    .slice(0, 3)
    .join(" | ")
    .slice(0, 500);
}

/**
 * Build the self-heal prompt sent when the preview reports runtime errors.
 *
 * TWO CONSTRAINTS ON THE WORDING.
 *
 * 1. The first line is load-bearing. chat-panel one-click-sends this prompt only
 *    when it `startsWith("Fix the preview/runtime errors")`; change that opening
 *    and self-heal silently degrades to dropping text in the composer.
 *
 * 2. It must not name an output format. This prompt used to say "Use
 *    <file_update> with <search> and <replace> when possible", which was wrong in
 *    every mode it can actually reach: chat-panel sends it as "build" (whose
 *    system prompt demands a JSON object of complete files, with
 *    response_format: json_object on OpenAI-compatible providers), and the chat
 *    route may auto-route it to "patch" (which expects a JSON patch array —
 *    encouraged by "surgical" wording in this very prompt). The XML was a third
 *    format nobody asked for: the client parsed it, so the editor showed the fix,
 *    while the server extracted no files and persisted nothing.
 *
 * The format belongs to the mode's system prompt, which is the only thing that
 * knows which mode this is. This prompt states the TASK only.
 */
export function buildHealingPrompt(errors: PreviewRuntimeError[]): string {
  const actionable = errors.filter((e) => !isNoisePreviewError(e.message));
  const log = formatErrorsForHealing(actionable);
  if (!log) return "";
  const hasMapError = actionable.some(
    (e) => /\.map\b/i.test(e.message) || /reading 'map'/i.test(e.message),
  );
  const hasMissingComponent = actionable.some((e) => isMissingComponentError(e.message));
  const hints: string[] = [];
  if (hasMissingComponent) {
    hints.push(
      'One or more components failed to import — verify each file exists, default vs named exports match (e.g. `import Foo from` needs `export default Foo`), and paths are correct. Create any missing component files.',
    );
  }
  if (hasMapError) {
    hints.push(
      "One error is `.map()` on undefined — guard arrays before mapping (e.g. `(items ?? []).map(...)`) and ensure context/hooks return `[]` not `undefined`.",
    );
  }
  return [
    "Fix the preview/runtime errors below. Apply minimal surgical patches only.",
    "Touch only the lines needed to clear these errors — leave everything else exactly as it is. Do not restructure working code, rename anything, or drop existing features.",
    ...hints,
    "",
    "```",
    log,
    "```",
  ].join("\n");
}

/**
 * A late-mount CLEAR from the bridge: the empty-root probe reported a crash,
 * then React actually painted a moment later (slow cold sandbox / tunnel). The
 * parent must retract the phantom "Preview root is empty" banner. Returns the
 * error kind to retract, or null if this isn't a clear message.
 */
export function parsePreviewErrorClear(data: unknown): PreviewErrorKind | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "lifemark-preview-errors" || d.type !== "preview-error-clear") return null;
  return (d.kind as PreviewErrorKind) ?? "empty-root";
}

/**
 * The bridge announcing it just booted inside a FRESH preview document.
 *
 * This is the signal that lets a paused preview un-pause itself. Until it was
 * consumed, "Preview paused" was a one-way door: an error froze the overlay,
 * the code got repaired, the sandbox hot-reloaded, the app came back perfectly
 * — and the banner stayed up forever, because nothing ever retracted the
 * original error. Observed live on a project rendering 3.8 KB of correct
 * content underneath its own overlay.
 *
 * A new document means the previous document's errors are unverifiable
 * history, so the guard restarts evidence-gathering from scratch.
 */
export function parsePreviewReady(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d.source === "lifemark-preview-errors" && d.type === "preview-error-ready";
}

export function parsePreviewErrorMessage(data: unknown): PreviewRuntimeError | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "lifemark-preview-errors" || d.type !== "preview-error") return null;
  const extra = (d.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>;
  const message = String(d.message ?? "");
  const filename = extra.filename as string | undefined;
  const stack = extra.stack as string | undefined;
  if (isNoisePreviewError(message, { filename, stack })) return null;
  return {
    kind: (d.kind as PreviewErrorKind) ?? "runtime",
    message,
    filename,
    lineno: extra.lineno as number | undefined,
    colno: extra.colno as number | undefined,
    stack,
    url: d.url as string | undefined,
    timestamp: Number(d.timestamp) || Date.now(),
  };
}
