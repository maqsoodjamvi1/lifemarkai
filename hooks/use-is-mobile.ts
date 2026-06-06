"use client";

/**
 * Single source of truth for "are we on a mobile-class viewport?".
 *
 * Returns:
 *   • isMobile        — viewport width < 768 (matches the editor layout
 *                       breakpoint that switches between split-view and the
 *                       full-bleed Chat/Code/Preview pane stack)
 *   • isCoarsePointer — `pointer: coarse` media query — true for touch-only
 *                       devices regardless of viewport size (iPad Pro,
 *                       Android tablet, phone)
 *   • isStandalone    — true when running as an installed PWA OR inside the
 *                       Capacitor WebView — useful for hiding browser-only
 *                       UI like "install LifemarkAI as an app"
 *
 * Why this hook exists: editor-layout.tsx, chat-panel.tsx, and pwa-install-
 * prompt.tsx all detect mobile-ness with slightly different ad-hoc logic.
 * Consolidating prevents the layout breakpoints from drifting apart and
 * keeps SSR safe (window-touching logic lives behind a single guard).
 */

import { useEffect, useState } from "react";

export interface ViewportInfo {
  isMobile: boolean;
  isCoarsePointer: boolean;
  isStandalone: boolean;
}

const MOBILE_BREAKPOINT = 768;

/**
 * SSR-safe defaults — false for everything until the first effect runs.
 * That means the first render on the client matches the SSR HTML; no
 * hydration mismatch.
 */
const SSR_DEFAULTS: ViewportInfo = {
  isMobile: false,
  isCoarsePointer: false,
  isStandalone: false,
};

export function useIsMobile(): ViewportInfo {
  const [info, setInfo] = useState<ViewportInfo>(SSR_DEFAULTS);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mqlCoarse = window.matchMedia("(pointer: coarse)");
    const mqlStandalone = window.matchMedia("(display-mode: standalone)");

    function recompute() {
      setInfo({
        isMobile: window.innerWidth < MOBILE_BREAKPOINT,
        isCoarsePointer: mqlCoarse.matches,
        // Also true inside Capacitor — the WebView identifies as standalone.
        isStandalone:
          mqlStandalone.matches ||
          // iOS Safari before display-mode media query — falls back to the
          // legacy property which only exists on Safari.
          (typeof (window.navigator as any).standalone === "boolean" &&
            (window.navigator as any).standalone === true),
      });
    }

    recompute();

    window.addEventListener("resize", recompute);
    mqlCoarse.addEventListener("change", recompute);
    mqlStandalone.addEventListener("change", recompute);

    return () => {
      window.removeEventListener("resize", recompute);
      mqlCoarse.removeEventListener("change", recompute);
      mqlStandalone.removeEventListener("change", recompute);
    };
  }, []);

  return info;
}
