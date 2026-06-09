"use client";

/**
 * ServiceWorkerRegistrar
 * Registers /sw.js on mount — in PRODUCTION only, and never on /editor.
 *
 * The editor loads many hashed _next/static chunks; a cache-first SW (v2) caused
 * "Failed to load chunk" after deploy/rebuild. Editor routes always unregister
 * the SW and clear lifemarkai-* caches so chunks load fresh from the network.
 */

import { useEffect, useLayoutEffect } from "react";
import { clearLifemarkServiceWorker } from "@/lib/sw-cleanup";
import { clearChunkReloadFlag, installChunkErrorRecovery } from "@/lib/import-with-retry";

export function ServiceWorkerRegistrar() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.location.pathname.startsWith("/editor")) return;
    clearLifemarkServiceWorker();
    clearChunkReloadFlag();
    return installChunkErrorRecovery();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onEditor = window.location.pathname.startsWith("/editor");

    if (onEditor || process.env.NODE_ENV !== "production") {
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {});
  }, []);

  return null;
}
