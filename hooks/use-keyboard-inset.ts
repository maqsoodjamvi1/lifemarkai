"use client";

/**
 * Keyboard inset hook — returns the height the on-screen keyboard is
 * currently covering at the bottom of the viewport.
 *
 * Uses `window.visualViewport` which is now supported on iOS Safari 13+,
 * Chrome Android, and most modern WebViews (including Capacitor). When the
 * soft keyboard appears, the visual viewport's height shrinks; we infer the
 * keyboard height by comparing it to the layout viewport.
 *
 * Returns 0 on:
 *   • Desktop (no soft keyboard)
 *   • Browsers without visualViewport (older Safari, very old Android)
 *   • Devices in landscape mode where the keyboard doesn't overlay
 *
 * Consumers typically apply the inset as bottom padding so fixed-position
 * elements stay above the keyboard:
 *
 *     const inset = useKeyboardInset();
 *     <div style={{ paddingBottom: inset }}> … </div>
 *
 * Or as a translateY on a sticky composer so it lifts up:
 *
 *     <div style={{ transform: `translateY(-${inset}px)` }}>
 */

import { useEffect, useState } from "react";

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    function recompute() {
      // The bottom-edge offset between the layout viewport and the visual
      // viewport is the most reliable signal across browsers. On iOS the
      // visual viewport shrinks AND scrolls up when the keyboard opens, so
      // we have to account for both height delta and offsetTop.
      const layoutHeight = window.innerHeight;
      const visualHeight = vv!.height;
      const offsetTop = vv!.offsetTop ?? 0;
      // `next` is the height of the area the keyboard is covering at the
      // bottom. Clamp to >= 0 so transient browser-chrome resize events
      // don't produce negative values.
      const next = Math.max(0, layoutHeight - (visualHeight + offsetTop));
      setInset(next);
    }

    recompute();
    vv.addEventListener("resize", recompute);
    vv.addEventListener("scroll", recompute);
    return () => {
      vv.removeEventListener("resize", recompute);
      vv.removeEventListener("scroll", recompute);
    };
  }, []);

  return inset;
}
