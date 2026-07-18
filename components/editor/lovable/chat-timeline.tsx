"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface LovableChatTimelineProps<T> {
  projectId: string;
  items: T[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  renderItem: (item: T, index: number) => React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Estimated row height for virtualization (threads vary; 280 is a safe default). */
  estimateSize?: number;
  enabled?: boolean;
}

function scrollStorageKey(projectId: string) {
  return `lifemark-chat-scroll-${projectId}`;
}

/**
 * Lovable-parity virtualized chat timeline with session scroll persistence.
 */
export function LovableChatTimeline<T>({
  projectId,
  items,
  scrollRef,
  renderItem,
  header,
  footer,
  className,
  estimateSize = 280,
  enabled = true,
}: LovableChatTimelineProps<T>) {
  const restoredRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 4,
    enabled: enabled && items.length > 8,
  });

  // Restore scroll position once per mount.
  useEffect(() => {
    if (restoredRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    try {
      const raw = sessionStorage.getItem(scrollStorageKey(projectId));
      if (raw) {
        const top = Number.parseInt(raw, 10);
        if (Number.isFinite(top)) el.scrollTop = top;
      }
    } catch {
      // private mode
    }
    restoredRef.current = true;
  }, [projectId, scrollRef]);

  // Persist scroll position.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      try {
        sessionStorage.setItem(scrollStorageKey(projectId), String(el.scrollTop));
      } catch {
        // private mode
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [projectId, scrollRef]);

  const useVirtual = enabled && items.length > 8;

  return (
    <div
      ref={scrollRef as React.Ref<HTMLDivElement>}
      data-chat-timeline
      className={cn(
        "flex-1 overflow-y-auto editor-scrollbar chat-scroll-container",
        "px-4 py-5 bg-[var(--bg-base)] dark:bg-background",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-3xl space-y-5">
        {header}

        {useVirtual ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const item = items[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {renderItem(item, virtualRow.index)}
                </div>
              );
            })}
          </div>
        ) : (
          items.map((item, index) => (
            <div key={index}>{renderItem(item, index)}</div>
          ))
        )}

        {footer}
      </div>
    </div>
  );
}
