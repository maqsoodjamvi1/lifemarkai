/** Remove LifemarkAI service workers and caches — required on /editor to avoid stale chunk 404s. */
export function clearLifemarkServiceWorker(): void {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => {
        regs.forEach((reg) => reg.unregister().catch(() => {}));
      })
      .catch(() => {});
  }

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => {
        keys
          .filter((k) => k.startsWith("lifemarkai-"))
          .forEach((k) => caches.delete(k).catch(() => {}));
      })
      .catch(() => {});
  }
}

const CHUNK_RELOAD_KEY = "lifemark-chunk-reload";
const CHUNK_RELOAD_MAX = 2;

function isChunkLoadMessage(message: string): boolean {
  return (
    message.includes("Failed to load chunk") ||
    message.includes("Loading chunk") ||
    message.includes("ChunkLoadError") ||
    message.includes("Failed to fetch dynamically imported module")
  );
}

/** Client-side chunk recovery — SPA navigations to /editor (lm-boot.js handles full loads). */
export function installEditorChunkRecovery(): void {
  if (typeof window === "undefined") return;
  if (document.getElementById("lm-boot")) return;
  clearLifemarkServiceWorker();

  function reloadOnChunkError(): boolean {
    const count = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0");
    if (count >= CHUNK_RELOAD_MAX) {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(count + 1));
    const url = new URL(location.href);
    url.searchParams.set("_cb", String(Date.now()));
    window.setTimeout(() => location.replace(url.toString()), 2000);
    return true;
  }

  function onChunkError(reason: unknown): void {
    const message = reason instanceof Error ? reason.message : String(reason ?? "");
    if (isChunkLoadMessage(message)) reloadOnChunkError();
  }

  window.addEventListener("error", (e) => {
    if (e.target instanceof HTMLScriptElement) return;
    onChunkError(e.error ?? e.message);
  });
  window.addEventListener("unhandledrejection", (e) => onChunkError(e.reason));
  window.addEventListener("load", () => {
    window.setTimeout(() => sessionStorage.removeItem(CHUNK_RELOAD_KEY), 5000);
  });
}

/** @deprecated lm-boot.js + AppBootScript — kept for editor-boot-script */
export const APP_BOOT_SCRIPT = "";
export const EDITOR_BOOT_SCRIPT = APP_BOOT_SCRIPT;
