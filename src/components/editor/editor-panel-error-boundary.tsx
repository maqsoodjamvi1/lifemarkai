import { Component,type ErrorInfo,type ReactNode } from "react";
import { AlertTriangle,RefreshCw } from "lucide-react";

interface EditorPanelErrorBoundaryProps {
  children: ReactNode;
  name: string;
  resetKey?: string;
}

interface EditorPanelErrorBoundaryState {
  error: Error | null;
}

/**
 * Contains failures to one editor pane. Chat, preview, and tool panels load a
 * large amount of optional code; one bad lazy chunk or render must not unmount
 * the user's other pane or discard an unsaved Monaco buffer.
 */
export class EditorPanelErrorBoundary extends Component<
  EditorPanelErrorBoundaryProps,
  EditorPanelErrorBoundaryState
> {
  state: EditorPanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): EditorPanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[editor:${this.props.name.toLowerCase()}] panel crashed`, error, info);
  }

  componentDidUpdate(previous: EditorPanelErrorBoundaryProps) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        className="flex h-full min-h-0 items-center justify-center bg-background p-6"
        role="alert"
      >
        <div className="w-full max-w-sm rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-center">
          <AlertTriangle className="mx-auto mb-3 size-6 text-amber-500" aria-hidden />
          <h2 className="text-sm font-semibold">{this.props.name} stopped unexpectedly</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The rest of the editor is still available. Retry this panel without reloading the page.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mx-auto mt-4 inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background"
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Retry {this.props.name.toLowerCase()}
          </button>
        </div>
      </div>
    );
  }
}
