/**
 * /editor/$projectId — Workspace / Canvas route.
 *
 * Search params are Zod-validated (editorSearchValidator) so URL changes
 * drive typed React updates without a Next.js RSC prefetch cycle.
 */
import { lazy,Suspense,useEffect } from "react";
import {
createFileRoute,
redirect,
notFound,
Link,
} from "@tanstack/react-router";
import { AlertCircle,ArrowLeft,RefreshCw,Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchEditorData,PROJECT_ID_RE } from "@/lib/editor-server";
import {
editorSearchValidator,
normalizeEditorSearchInput,
} from "@/lib/editor-search";

const EditorLayoutBridge = lazy(() =>
  import("@/components/editor/editor-layout-bridge").then((m) => ({
    default: m.EditorLayoutBridge,
  })),
);

export const Route = createFileRoute("/editor/$projectId")({
  /**
   * Run the loader on the server, but render the component ONLY on the client.
   *
   * WHY: the editor pulls in ~238 components plus Monaco and the preview
   * bridge — a tree that is inherently client-only (it touches window, workers
   * and canvas). Server-rendering it bought nothing and cost everything: on a
   * cold dev cache the SSR render ran past TanStack's 120s stream lifetime cap,
   * which emits an unhandled 'error' event on the Readable and HARD-CRASHES the
   * node process:
   *
   *   SSR stream transform exceeded maximum lifetime (120000ms), forcing cleanup
   *   Error: Stream lifetime exceeded   (transformStreamWithRouter.js:478)
   *
   * 'data-only' keeps the parts of SSR that actually matter here — the loader
   * still runs server-side, so the auth redirect, notFound and <head> meta are
   * all preserved and there is no auth flash — while the heavy render happens
   * in the browser where it belongs.
   */
  ssr: "data-only",
  validateSearch: (search: Record<string, unknown>) =>
    editorSearchValidator.parse(normalizeEditorSearchInput(search)),
  loader: async ({ params, location }) => {
    const { projectId } = params;
    if (!PROJECT_ID_RE.test(projectId)) throw notFound();

    const result = await fetchEditorData({ data: { projectId } });

    if (result.status === "unauthenticated") {
      const returnTo = `/editor/${projectId}${location.searchStr ?? ""}`;
      throw redirect({ to: "/login", search: { next: returnTo } });
    }
    if (result.status === "not_found") throw notFound();
    return result;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title:
          loaderData && loaderData.status === "ok"
            ? `${(loaderData.project as any).name} — Editor | LifemarkAI`
            : "Editor | LifemarkAI",
      },
    ],
  }),
  errorComponent: EditorErrorComponent,
  pendingComponent: EditorPending,
  notFoundComponent: EditorNotFound,
  component: EditorPage,
});

function EditorPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();

  if (data.status === "transient") {
    return <EditorConnectivityError detail={data.detail} />;
  }

  return (
    <Suspense fallback={<EditorPending />}>
      <EditorLayoutBridge
        project={data.project}
        files={data.files}
        messages={data.messages}
        hasMore={data.hasMore}
        profile={data.profile}
        starterPrompt={search.prompt}
        starterMode={search.mode}
        autoDeploy={search.deploy === "true"}
        initialFilePath={search.file}
        initialView={search.view}
        initialPanel={search.panel}
        forceShell={search.shell === true || search.shell === "1" || search.shell === "true"}
      />
    </Suspense>
  );
}

function EditorConnectivityError({ detail }: { detail?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-400 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-100">Connection hiccup</h1>
        <p className="text-slate-400">
          {detail ?? "We couldn't reach the database. This is usually temporary."}
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={() => window.location.reload()} className="w-full gap-2">
            <RefreshCw className="w-4 h-4" /> Retry
          </Button>
          <Link to="/dashboard" className="w-full">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function EditorErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error("Editor error:", error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-100">Editor Error</h1>
        <p className="text-slate-400">
          {error.message || "An unexpected error occurred while loading the editor."}
        </p>
        <div className="flex flex-col gap-2 pt-4">
          <Button onClick={reset} className="w-full">Try Again</Button>
          <Link to="/dashboard" className="w-full">
            <Button variant="outline" className="w-full">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function EditorPending() {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Loading editor…</span>
      </div>
    </div>
  );
}

function EditorNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-slate-500 mx-auto" />
        <h1 className="text-2xl font-bold text-slate-100">Project not found</h1>
        <p className="text-slate-400">
          This project doesn't exist, or you don't have access to it.
        </p>
        <Link to="/dashboard">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
