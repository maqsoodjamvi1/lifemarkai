/**
 * Mounts the LOCAL EditorLayout (src/components/editor — fully internalized).
 * Client-only: shared Framer/React graph must not enter Start SSR.
 * Import/render failures surface as retryable errors — no silent EditorShell demotion.
 * EditorShell remains an explicit diagnostic escape hatch (?shell=1).
 *
 * Next.js coupling removed: the local editor tree has zero next/* imports, so the
 * @lifemark/editor alias and the next/* Vite shims are no longer required by it.
 */
import { lazy,Suspense,Component,useEffect,useState,type ReactNode,type ErrorInfo } from "react";
import { Loader2,AlertTriangle,RefreshCw } from "lucide-react";
import { EditorShell,type EditorShellProps } from "./editor-shell";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/toaster";

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

const RemoteEditorLayout = lazy(async () => {
  const mod = await import("@/components/editor/editor-layout");
  void fetch("/api/debug-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hypothesisId: "H4",
      location: "editor-layout-bridge.tsx:lazy-ok",
      message: "shared EditorLayout module loaded",
      data: { hasEditorLayout: typeof mod.EditorLayout === "function" },
      runId: "tanstack-editor-fix",
    }),
  }).catch(() => {});
  if (typeof mod.EditorLayout !== "function") {
    throw new Error("EditorLayout export missing from @/components/editor/editor-layout");
  }
  return { default: mod.EditorLayout as React.ComponentType<any> };
});

class BridgeErrorBoundary extends Component<
  { children: ReactNode; projectId?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    void fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hypothesisId: "H4",
        location: "editor-layout-bridge.tsx:error-boundary",
        message: "shared EditorLayout crashed",
        data: {
          projectId: this.props.projectId ?? null,
          error: error.message,
          name: error.name,
          stack: (error.stack ?? "").slice(0, 500),
          componentStack: (info.componentStack ?? "").slice(0, 400),
        },
        runId: "tanstack-editor-fix",
      }),
    }).catch(() => {});
  }
  render() {
    if (this.state.error) {
      return (
        <EditorLoadError
          title="Editor failed to render"
          detail={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

export function EditorLayoutBridge(props: EditorLayoutBridgeProps) {
  const { forceShell = false, ...shellProps } = props;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    void fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hypothesisId: "H4",
        location: "editor-layout-bridge.tsx:mount",
        message: "client mounted before shared editor import",
        data: { projectId: props.project.id, forceShell },
        runId: "tanstack-editor-fix",
      }),
    }).catch(() => {});
    setMounted(true);
  }, [props.project.id, forceShell]);

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
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryProvider>
        <ConfirmDialogProvider>
          <BridgeErrorBoundary projectId={props.project.id}>
            <Suspense
              fallback={
                <div className="h-screen flex items-center justify-center text-muted-foreground gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading editor…
                </div>
              }
            >
              <RemoteEditorLayout
                project={props.project}
                initialFiles={props.files}
                initialMessages={props.messages}
                initialHasMoreMessages={props.hasMore}
                profile={props.profile}
                starterPrompt={props.starterPrompt}
                starterMode={props.starterMode}
                autoDeploy={props.autoDeploy}
                initialFilePath={props.initialFilePath}
                initialView={props.initialView}
                initialPanel={props.initialPanel}
              />
            </Suspense>
          </BridgeErrorBoundary>
          <Toaster />
        </ConfirmDialogProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
