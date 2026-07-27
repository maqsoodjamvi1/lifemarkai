/**
 * EditorShell — fallback seam when full EditorLayout fails to mount.
 * Honors Zod-validated search: file / view / panel / prompt / mode.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileCode2, MessageSquare, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project, ProjectFile, Message, Profile } from "@/types/database";
import type { EditorSearch } from "@/lib/editor-search";

export interface EditorShellProps {
  project: Project;
  files: ProjectFile[];
  messages: Message[];
  hasMore: boolean;
  profile: Profile | null;
  starterPrompt?: string;
  starterMode?: string;
  autoDeploy?: boolean;
  initialFilePath?: string;
  initialView?: EditorSearch["view"];
  initialPanel?: string;
}

export function EditorShell({
  project,
  files,
  messages,
  hasMore,
  profile,
  starterPrompt,
  starterMode,
  initialFilePath,
  initialView,
  initialPanel,
}: EditorShellProps) {
  const navigate = useNavigate({ from: "/editor/$projectId" });
  const [activePath, setActivePath] = useState(
    () =>
      initialFilePath ||
      files.find((f) => f.path === "src/App.tsx" || f.path === "app/page.tsx" || f.path === "index.html")
        ?.path ||
      files[0]?.path ||
      "",
  );
  const [view, setView] = useState(initialView ?? "both");
  const active = files.find((f) => f.path === activePath) ?? files[0];

  useEffect(() => {
    if (initialFilePath && files.some((f) => f.path === initialFilePath)) {
      setActivePath(initialFilePath);
    }
  }, [initialFilePath, files]);

  function selectFile(path: string) {
    setActivePath(path);
    void navigate({
      search: (prev) => ({ ...prev, file: path }),
      replace: true,
    });
  }

  const showCode = view === "code" || view === "both" || view === "files";
  const showChat = view !== "code" && view !== "files";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <div className="h-12 border-b border-border/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-7 h-7 rounded-lg bg-gradient-brand flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold truncate">{(project as any).name}</span>
          <span className="text-xs text-muted-foreground shrink-0">
            {(project as any).framework ?? "react"}
          </span>
          {starterMode && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {starterMode}
            </span>
          )}
          {initialPanel && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              panel:{initialPanel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(["preview", "code", "both"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                void navigate({ search: (prev) => ({ ...prev, view: v }), replace: true });
              }}
              className={`text-[11px] px-2 py-1 rounded capitalize ${
                view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {v}
            </button>
          ))}
          <span className="text-xs text-muted-foreground ml-2">
            {(profile as any)?.credits ?? 0} credits
          </span>
        </div>
      </div>

      {starterPrompt && (
        <div className="px-4 py-2 text-xs border-b border-border/40 bg-muted/30 text-muted-foreground truncate">
          Starter: {starterPrompt}
        </div>
      )}

      <div
        className={`flex-1 grid min-h-0 ${
          showChat && showCode ? "grid-cols-[220px_1fr_320px]" : showCode ? "grid-cols-[220px_1fr]" : "grid-cols-1"
        }`}
      >
        {showCode && (
          <div className="border-r border-border/50 overflow-y-auto py-2">
            <div className="px-3 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <FileCode2 className="w-3 h-3" /> Files ({files.length})
            </div>
            {files.map((f) => (
              <button
                key={(f as any).id ?? f.path}
                type="button"
                onClick={() => selectFile(f.path)}
                className={`w-full text-left px-3 py-1 text-xs truncate hover:bg-muted/60 ${
                  f.path === activePath ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                {f.path}
              </button>
            ))}
          </div>
        )}

        {showCode && (
          <div className="overflow-auto bg-muted/20">
            <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border/40 sticky top-0 bg-background/80 backdrop-blur">
              {active?.path ?? "—"}
            </div>
            <pre className="p-4 text-xs leading-relaxed font-mono whitespace-pre-wrap">
              {(active as any)?.content ?? "// select a file"}
            </pre>
          </div>
        )}

        {showChat && (
          <div className="border-l border-border/50 flex flex-col min-h-0">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/40 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" /> Chat{" "}
              {hasMore && <span className="text-amber-500">(older hidden)</span>}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((m) => (
                <div key={(m as any).id} className="text-xs">
                  <div className="text-[10px] uppercase text-muted-foreground mb-0.5">
                    {(m as any).role}
                  </div>
                  <div className="text-foreground/90 whitespace-pre-wrap line-clamp-6">
                    {(m as any).content}
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground">No messages yet — start building.</p>
              )}
            </div>
            <div className="p-3 border-t border-border/40">
              <Button className="w-full h-9" size="sm">
                Open full editor
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
