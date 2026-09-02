import type { ReactNode, Ref } from "react";
import { useRef } from "react";
import { Loader2 } from "lucide-react";
import { announcePreviewSettled } from "@/lib/preview/wait-for-preview-success";

/** Immediate same-tab preview so the pane is never a blank spinner. */
export function InstantSrcdocPreview({
  html,
  iframeRef,
  title,
  status,
  actions,
  onReady,
  contentKey,
}: {
  html: string;
  iframeRef?: Ref<HTMLIFrameElement>;
  title: string;
  status?: string | null;
  actions?: ReactNode;
  onReady?: () => void;
  contentKey?: string;
}) {
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const settledForKeyRef = useRef<string | null>(null);
  const srcDoc = typeof html === "string" ? html : "";
  const statusText = typeof status === "string" && status.trim() ? status : null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {(statusText || actions) && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-20 -translate-x-1/2">
          <div className="pointer-events-auto flex max-w-[min(28rem,calc(100%-1rem))] items-center gap-2 rounded-full border border-border/70 bg-background/95 px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
            {statusText && !actions ? <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-400" /> : null}
            {statusText ? <span className="truncate">{statusText}</span> : null}
            {actions}
          </div>
        </div>
      )}
      <iframe
        id="static-preview-panel"
        key={contentKey}
        ref={iframeRef}
        srcDoc={srcDoc}
        className="h-full min-h-0 w-full border-0 bg-white"
        title={title}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
        allow="clipboard-read; clipboard-write; fullscreen"
        onLoad={() => {
          const stamp = contentKey ?? "srcdoc";
          if (settledForKeyRef.current === stamp) return;
          settledForKeyRef.current = stamp;
          try {
            announcePreviewSettled(true);
            onReadyRef.current?.();
          } catch (err) {
            console.error("[preview] srcdoc ready callback failed", err);
          }
        }}
      />
    </div>
  );
}

export function LivePreviewWaiting({
  status,
  title,
  paused,
  actions,
}: {
  status: string;
  title?: string;
  /** Lovable “Still building?” — idle sandbox, not a blank iframe. */
  paused?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[var(--bg-base,#0a0a0a)] px-6 text-center">
      {!paused ? <Loader2 className="mb-3 h-5 w-5 animate-spin text-violet-400" /> : null}
      {paused ? (
        <p className="mb-1 max-w-sm text-sm font-medium text-foreground">
          {title || "Still building?"}
        </p>
      ) : title ? (
        <p className="mb-1 max-w-sm text-sm font-medium text-foreground">{title}</p>
      ) : null}
      <p className="max-w-sm text-sm text-foreground/85">{status}</p>
      {paused ? (
        <p className="mt-2 max-w-sm text-[11px] text-muted-foreground">
          The live preview origin paused to save resources. Resume to boot it again.
        </p>
      ) : null}
      {actions ? <div className="mt-3 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PreviewCrashFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col" role="alert">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-amber-500/10 px-3 py-1.5 text-[11px]">
        <span className="min-w-0 truncate text-muted-foreground">
          {error.message || "Preview stopped"}
        </span>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-7 shrink-0 items-center rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
        >
          Retry preview
        </button>
      </div>
      <LivePreviewWaiting status="The live preview pane crashed. Retry to reconnect to the sandbox origin." />
    </div>
  );
}
