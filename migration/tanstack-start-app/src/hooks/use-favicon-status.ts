
/**
 * Favicon build-status badge (Lovable parity, Jul 10 2026 changelog):
 * the browser-tab icon shows a colored dot while the AI is building and a
 * brief green dot when it finishes, so background tabs communicate state.
 */

import { useEffect, useRef } from "react";

function findIconLink(): HTMLLinkElement | null {
  return (
    document.querySelector<HTMLLinkElement>('link[rel="icon"]') ??
    document.querySelector<HTMLLinkElement>('link[rel="shortcut icon"]')
  );
}

/** Module-level pristine favicon — shared across hook instances so a second
 *  mounted editor can never capture a badged data-URI as its "original". */
let pristineFavicon: string | null = null;
function getPristine(link: HTMLLinkElement): string {
  if (pristineFavicon === null) pristineFavicon = link.href;
  return pristineFavicon;
}

function drawBadged(original: string, color: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(original);
        ctx.drawImage(img, 0, 0, size, size);
        const r = 7;
        ctx.beginPath();
        ctx.arc(size - r - 1, size - r - 1, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(original); // tainted canvas or draw failure — keep original
      }
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

export function useFaviconStatus(building: boolean) {
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasBuildingRef = useRef(false);

  useEffect(() => {
    const link = findIconLink();
    if (!link) return;
    const original = getPristine(link);
    let cancelled = false;

    const restore = () => {
      if (original) link.href = original;
    };

    if (doneTimerRef.current) {
      clearTimeout(doneTimerRef.current);
      doneTimerRef.current = null;
    }

    if (building) {
      wasBuildingRef.current = true;
      void drawBadged(original, "#f59e0b").then((url) => {
        if (!cancelled) link.href = url;
      });
    } else if (wasBuildingRef.current) {
      // Finished — flash green, then restore.
      wasBuildingRef.current = false;
      void drawBadged(original, "#10b981").then((url) => {
        if (cancelled) return;
        link.href = url;
        doneTimerRef.current = setTimeout(restore, 5000);
      });
    } else {
      restore();
    }

    return () => {
      cancelled = true;
    };
  }, [building]);

  // Restore on unmount.
  useEffect(() => {
    return () => {
      const link = findIconLink();
      if (link && pristineFavicon) link.href = pristineFavicon;
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, []);
}
