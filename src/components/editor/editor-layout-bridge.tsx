/**
 * Mounts the local EditorLayout on the client only.
 *
 * The editor route uses `ssr: "data-only"`, but this extra `mounted` gate
 * still avoids touching window/workers if the module is evaluated during SSR.
 * EditorLayout is a static import (not React.lazy): Vite HMR invalidates
 * `import()` URLs with a stale `?t=` and lazy caches the 404, which painted
 * "Editor failed to render" with Retry doing nothing.
 *
 * EditorShell remains an explicit diagnostic escape hatch (`?shell=1`).
 */
import { Component,Fragment,useEffect,useState,type ErrorInfo,type ReactNode } from "react";
import { AlertTriangle,Loader2,RefreshCw } from "lucide-react";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/toaster";
import { EditorLayout } from "./editor-layout";
import { editorModeSchema } from "@/lib/editor-search";
import { EditorShell,type EditorShellProps } from "./editor-shell";
import { clearChunkReloadFlag,installChunkErrorRecovery } from "@/lib/import-with-retry";

export type EditorLayoutBridgeProps = EditorShellProps & {
  /** Explicit diagnostic escape hatch — never the default path. */
  forceShell?: boolean;
};

function EditorLoadError({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-lg border bg-background p-6 shadow-sm space-y-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            {detail ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {detail.slice(0, 600)}
              </p>
            ) : null}
          </div>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        ) : null}
      </div>
    </div>
  );
}

class BridgeErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; remount: number }
> {
  state = { error: null as Error | null, remount: 0 };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[editor-layout-bridge] EditorLayout crashed", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <EditorLoadError
          title="Editor failed to render"
          detail={this.state.error.message}
          onRetry={() => this.setState((s) => ({ error: null, remount: s.remount + 1 }))}
        />
      );
    }
    return <Fragment key={this.state.remount}>{this.props.children}</Fragment>;
  }
}

export function EditorLayoutBridge(props: EditorLayoutBridgeProps) {
  const { forceShell = false, ...shellProps } = props;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    clearChunkReloadFlag();
    return installChunkErrorRecovery();
  }, []);

  if (forceShell) {
    return <EditorShell {...shellProps} />;
  }

  if (!mounted) {
    return (
      <div className="h-screen flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading editor…
      </div>
    );
  }

  return (
    <QueryProvider>
      <ConfirmDialogProvider>
        <BridgeErrorBoundary>
          <EditorLayout
            key={props.project.id}
            project={props.project}
            initialFiles={props.files}
            initialMessages={props.messages}
            initialHasMoreMessages={props.hasMore}
            profile={props.profile}
            starterPrompt={props.starterPrompt}
            starterMode={editorModeSchema.safeParse(props.starterMode).data}
            autoDeploy={props.autoDeploy}
            initialFilePath={props.initialFilePath}
            initialView={props.initialView}
            initialPanel={props.initialPanel}
          />
        </BridgeErrorBoundary>
        <Toaster />
      </ConfirmDialogProvider>
    </QueryProvider>
  );
}
