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
  estimateSize?: number | ((index: number) => number);
  enabled?: boolean;
  /** Stable per-item key — index keys reattach row-local UI state (expanded
   *  cards, collapsed code blocks) to the WRONG row on insert/remove. */
  getItemKey?: (item: T, index: number) => string | number;
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
    getItemKey,
  }: LovableChatTimelineProps<T>,
  ref: React.ForwardedRef<LovableChatTimelineHandle>,
) {
  const restoredRef = useRef(false);
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      typeof estimateSize === "function" ? estimateSize(index) : estimateSize,
    overscan: 4,
    enabled: enabled && items.length > 8,
  });
  virtualizerRef.current = virtualizer;

  useImperativeHandle(ref, () => ({
    scrollToThreadIndex(index, align = "center") {
      if (index < 0 || index >= items.length) return;
      const useVirtual = enabled && items.length > 8;
      if (useVirtual) {
        const v = virtualizerRef.current;
        // First jump mounts the row; a follow-up pass corrects after measure.
        v?.scrollToIndex(index, { align, behavior: "auto" });
        requestAnimationFrame(() => {
          v?.scrollToIndex(index, { align, behavior: "smooth" });
        });
        return;
      }
      const el = scrollRef.current?.querySelector(`[data-thread-index="${index}"]`);
      el?.scrollIntoView({ block: align === "start" ? "start" : "center", behavior: "smooth" });
    },
  }), [enabled, items.length, scrollRef]);

  // Restore scroll once per project. Deps must stay fixed-length (HMR-safe).
  useEffect(() => {
    restoredRef.current = false;
  }, [projectId]);

  // Open at the LATEST messages, always. A stored mid-list offset (or a
  // one-shot scrollTop = scrollHeight) strands the user in the middle of the
  // thread: virtualization swaps estimated row heights (280px) for measured
  // ones over several frames, so "bottom" computed early is mid-list by the
  // time measurement settles. Pin to bottom until the height is stable —
  // and stop immediately if the user starts scrolling themselves.
  useEffect(() => {
    if (restoredRef.current) return;
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    try {
      sessionStorage.removeItem(scrollStorageKey(projectId)); // legacy offsets
    } catch { /* private mode */ }

    let raf = 0;
    let lastHeight = -1;
    let stableFrames = 0;
    let frames = 0;
    const stop = () => {
      restoredRef.current = true;
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
    const step = () => {
      const node = scrollRef.current;
      if (!node) return stop();
      node.scrollTop = node.scrollHeight;
      stableFrames = node.scrollHeight === lastHeight ? stableFrames + 1 : 0;
      lastHeight = node.scrollHeight;
      frames += 1;
      // Only trust stability once real content has rendered (taller than the
      // viewport) — an empty/pre-measure container is "stable" at ~0px and
      // stopping there stranded the view at the TOP once rows painted.
      const contentReady = node.scrollHeight > node.clientHeight + 40;
      if ((stableFrames >= 8 && contentReady) || frames >= 180) return stop();
      raf = requestAnimationFrame(step);
    };
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
  }, [projectId, scrollRef, items.length]);

  const useVirtual = enabled && items.length > 8;

  return (
    <div
      ref={scrollRef as React.Ref<HTMLDivElement>}
      data-chat-timeline
      className={cn(
        // Lovable dump scroller: chat-scroll-container h-full w-full overflow-y-auto,
        // padding-bottom: max(4rem, nudge + 0.5rem); rows self-pad (py-2, px-4/pr-4).
        "flex-1 overflow-y-auto editor-scrollbar chat-scroll-container",
        "bg-[var(--bg-base)] dark:bg-background",
        className,
      )}
      style={{
        overflowAnchor: "none",
        paddingBottom: "max(4rem, calc(var(--chat-nudge-overlay-px, 0px) + 0.5rem))",
      }}
    >
      <div className="mx-auto w-full max-w-3xl">
        <div aria-hidden style={{ height: "var(--chat-top-safe-padding, 12px)" }} />
        <div className="px-4">{header}</div>

        {useVirtual ? (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
              overflowAnchor: "none",
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
                    top: `${virtualRow.start}px`,
                    left: 0,
                    width: "100%",
                  }}
                >
                  {renderItem(item, virtualRow.index)}
                </div>
              );
            })}
          </div>
        ) : (
          items.map((item, index) => (
            <div key={getItemKey ? getItemKey(item, index) : index} data-thread-index={index}>
              {renderItem(item, index)}
            </div>
          ))
        )}

        <div className="px-4">{footer}</div>
      </div>
    </div>
  );
}

export const LovableChatTimeline = forwardRef(LovableChatTimelineInner) as <T>(
  props: LovableChatTimelineProps<T> & { ref?: React.ForwardedRef<LovableChatTimelineHandle> },
) => React.ReactElement;
