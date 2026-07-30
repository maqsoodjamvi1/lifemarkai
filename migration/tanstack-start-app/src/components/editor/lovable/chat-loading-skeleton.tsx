
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LovableChatLoadingSkeletonProps {
  className?: string;
}

/** Lovable-parity message thread skeleton while SSR/history loads. */
export function LovableChatLoadingSkeleton({ className }: LovableChatLoadingSkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-6 px-3 py-4 animate-pulse", className)}>
      <div className="flex flex-col items-end gap-2">
        <Skeleton className="h-10 w-2/3 rounded-[var(--radius-3)] bg-[var(--bg-muted)]" />
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3.5 w-20 rounded-full bg-[var(--bg-muted)]" />
        <Skeleton className="h-20 w-full rounded-[var(--radius-3)] bg-[var(--bg-secondary-pulse)]" />
        <Skeleton className="h-3 w-4/5 rounded-full bg-[var(--bg-muted)]" />
        <Skeleton className="h-3 w-3/5 rounded-full bg-[var(--bg-muted)]" />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Skeleton className="h-10 w-1/2 rounded-[var(--radius-3)] bg-[var(--bg-muted)]" />
      </div>
      <div className="flex flex-col gap-2.5">
        <Skeleton className="h-3.5 w-24 rounded-full bg-[var(--bg-muted)]" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-3)] bg-[var(--bg-secondary-pulse)]" />
        <Skeleton className="h-3 w-2/3 rounded-full bg-[var(--bg-muted)]" />
      </div>
    </div>
  );
}
