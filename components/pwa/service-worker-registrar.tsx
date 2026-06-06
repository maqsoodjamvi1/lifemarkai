"use client";

/**
 * ServiceWorkerRegistrar
 * Registers /sw.js on mount — in PRODUCTION only.
 *
 * In development it actively unregisters any existing service worker and
 * clears its caches. A SW that serves _next/static cache-first fights the
 * dev server: after every recompile it can hand back stale or truncated
 * chunks (garbled "source map" errors, failed RSC payload fetches, broken
 * client-side navigation). Unregistering — not just skipping registration —
 * matters because a SW installed by a previous session stays active until
 * explicitly removed.
 */

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Dev: remove any previously-installed SW and its caches.
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((reg) => reg.unregister().catch(() => {}));
      }).catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys
            .filter((k) => k.startsWith("lifemarkai-"))
            .forEach((k) => caches.delete(k).catch(() => {}));
        }).catch(() => {});
      }
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // Non-fatal — app works fine without the SW
      });
  }, []);

  return null;
}
