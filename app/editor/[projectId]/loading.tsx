import { Skeleton } from "@/components/ui/skeleton";

function FileTreeLineSkeleton({ indent = 0, width = "w-28" }: { indent?: number; width?: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-0.5" style={{ paddingLeft: `${8 + indent * 12}px` }}>
      <Skeleton className="h-3.5 w-3.5 rounded-sm shrink-0" />
      <Skeleton className={`h-3 ${width}`} />
    </div>
  );
}

function ChatMessageSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <Skeleton className="h-7 w-7 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className={`h-3 ${wide ? "w-3/4" : "w-1/2"}`} />
        <Skeleton className="h-3 w-full" />
        {wide && <Skeleton className="h-3 w-5/6" />}
      </div>
    </div>
  );
}

export default function EditorLoading() {
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <div className="h-12 border-b border-border/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — chat + file tree */}
        <div className="w-80 border-r border-border/50 flex flex-col shrink-0">
          {/* Tab strip */}
          <div className="flex items-center gap-1 px-2 py-2 border-b border-border/50">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-7 w-7 rounded-md" />
            ))}
          </div>

          {/* Chat messages */}
          <div className="flex-1 overflow-hidden space-y-1 pt-2">
            <ChatMessageSkeleton />
            <ChatMessageSkeleton wide />
            <ChatMessageSkeleton />
            <ChatMessageSkeleton wide />
            <ChatMessageSkeleton />
          </div>

          {/* Input area */}
          <div className="p-3 border-t border-border/50 space-y-2">
            <Skeleton className="h-20 w-full rounded-lg" />
            <div className="flex justify-between">
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
          </div>
        </div>

        {/* Middle — file tree + editor */}
        <div className="flex flex-1 overflow-hidden">
          {/* File tree */}
          <div className="w-52 border-r border-border/50 flex flex-col shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <Skeleton className="h-3 w-16" />
              <div className="flex gap-1">
                <Skeleton className="h-5 w-5 rounded-sm" />
                <Skeleton className="h-5 w-5 rounded-sm" />
              </div>
            </div>
            <div className="flex-1 pt-2 space-y-1">
              <FileTreeLineSkeleton width="w-16" />
              <FileTreeLineSkeleton indent={1} width="w-20" />
              <FileTreeLineSkeleton indent={1} width="w-24" />
              <FileTreeLineSkeleton indent={2} width="w-16" />
              <FileTreeLineSkeleton indent={2} width="w-20" />
              <FileTreeLineSkeleton width="w-12" />
              <FileTreeLineSkeleton indent={1} width="w-28" />
              <FileTreeLineSkeleton indent={1} width="w-18" />
              <FileTreeLineSkeleton width="w-20" />
              <FileTreeLineSkeleton indent={1} width="w-16" />
            </div>
          </div>

          {/* Code editor area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50 bg-muted/20">
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-6 w-20 rounded-md opacity-50" />
            </div>
            {/* Code lines */}
            <div className="flex-1 p-4 space-y-2 font-mono">
              {[32, 56, 44, 80, 64, 48, 72, 36, 60, 52, 88, 40, 68, 56, 44].map((w, i) => (
                <Skeleton key={i} className="h-3 rounded-sm" style={{ width: `${w}%`, marginLeft: i % 3 === 1 ? "24px" : i % 3 === 2 ? "48px" : "0" }} />
              ))}
            </div>
          </div>
        </div>

        {/* Right — preview */}
        <div className="w-[45%] border-l border-border/50 flex flex-col shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/50" />
            </div>
            <Skeleton className="h-6 flex-1 rounded-md mx-2" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>
          <Skeleton className="flex-1 rounded-none" />
        </div>
      </div>
    </div>
  );
}
