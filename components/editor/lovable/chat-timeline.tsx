"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface LovableChatTimelineHandle {
  /** Scroll the virtual list to a thread row (no-op when virtualization is off). */
  scrollToThreadIndex: (index: number, align?: "start" | "center" | "end" | "auto") => void;
}

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
function LovableChatTimelineInner<T>(
  {
    projectId,
    items,
    scrollRef,
    renderItem,
    header,
    footer,
    className,
    estimateSize = 280,
    enabled = true,
  }: LovableChatTimelineProps<T>,
  ref: React.ForwardedRef<LovableChatTimelineHandle>,
) {
  const restoredRef = useRef(false);
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 4,
    enabled: enabled && items.length > 8,
  });
  virtualizerRef.current = virtualizer;

  useImperativeHandle(ref, () => ({
    scrollToThreadIndex(index, align = "center") {
      if (index < 0 || index >= items.length) return;
      const useVirtual = enabled && items.length > 8;
      if (useVirtual) {
        virtualizerRef.current?.scrollToIndex(index, { align, behavior: "smooth" });
        return;
      }
      const el = scrollRef.current?.querySelector(`[data-thread-index="${index}"]`);
      el?.scrollIntoView({ block: align === "start" ? "start" : "center", behavior: "smooth" });
    },
  }), [enabled, items.length, scrollRef]);

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
                  data-thread-index={virtualRow.index}
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
            <div key={index} data-thread-index={index}>
              {renderItem(item, index)}
            </div>
          ))
        )}

        {footer}
      </div>
    </div>
  );
}

export const LovableChatTimeline = forwardRef(LovableChatTimelineInner) as <T>(
  props: LovableChatTimelineProps<T> & { ref?: React.ForwardedRef<LovableChatTimelineHandle> },
) => React.ReactElement;
