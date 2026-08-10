
import { useEffect,useState } from "react";

export interface PreviewCommentPin {
  id: string;
  xpath: string;
  label?: string;
}

interface PreviewCommentPinsProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  pins: PreviewCommentPin[];
  /** When false, hide markers (e.g. during annotate mode). */
  enabled?: boolean;
  onPinClick?: (commentId: string, xpath: string) => void;
}

type MarkerPos = { id: string; xpath: string; label?: string; left: number; top: number; index: number };

/**
 * Same-origin srcdoc overlay for unresolved element comments.
 * Cross-origin engines (sandbox / WebContainer) render pins inside the VEB bridge instead.
 */
export function PreviewCommentPins({
  iframeRef,
  pins,
  enabled = true,
  onPinClick,
}: PreviewCommentPinsProps) {
  const [markers, setMarkers] = useState<MarkerPos[]>([]);

  useEffect(() => {
    if (!enabled || pins.length === 0) {
      setMarkers([]);
      return;
    }

    const measure = () => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe || !doc) {
        setMarkers([]);
        return;
      }
      const iframeRect = iframe.getBoundingClientRect();
      const next: MarkerPos[] = [];
      pins.forEach((pin, index) => {
        try {
          const node = doc.evaluate(
            pin.xpath.startsWith("//") ? pin.xpath : `//${pin.xpath}`,
            doc,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement | null;
          if (!node) return;
          const r = node.getBoundingClientRect();
          next.push({
            id: pin.id,
            xpath: pin.xpath,
            label: pin.label,
            index,
            left: iframeRect.left + r.left + r.width - 10,
            top: iframeRect.top + r.top - 10,
          });
        } catch {
          /* ignore bad xpath */
        }
      });
      setMarkers(next);
    };

    measure();
    const iframe = iframeRef.current;
    const win = iframe?.contentWindow;
    win?.addEventListener("scroll", measure, true);
    win?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    const timer = window.setInterval(measure, 800);
    return () => {
      win?.removeEventListener("scroll", measure, true);
      win?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
      window.clearInterval(timer);
    };
  }, [enabled, pins, iframeRef]);

  if (!enabled || markers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.label || "Comment"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onPinClick?.(m.id, m.xpath);
          }}
          className="pointer-events-auto fixed z-40 flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-violet-600 text-[11px] font-bold text-white shadow-md hover:scale-105 hover:bg-violet-700 transition-transform"
          style={{ left: Math.max(4, m.left), top: Math.max(4, m.top) }}
        >
          {m.index + 1}
        </button>
      ))}
    </div>
  );
}
