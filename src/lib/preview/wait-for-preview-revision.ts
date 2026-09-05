import { isPreviewFrameMessage } from "./preview-revision.ts";

export function waitForPreviewRevision(
  revision: string,
  frame: () => Window | null,
  url: () => string | null,
  signal: AbortSignal,
  host: Pick<Window, "addEventListener" | "removeEventListener"> = window,
  timeoutMs = 60_000,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(false); return; }
    const finish = (ok: boolean) => {
      clearTimeout(timeout); clearInterval(pings);
      host.removeEventListener("message", onMessage);
      signal.removeEventListener("abort", abort);
      resolve(ok);
    };
    const onMessage = (event: MessageEvent) => {
      if (!isPreviewFrameMessage(event, frame(), url())) return;
      if (event.data?.type === "lifemark-preview-revision-painted" && event.data.revision === revision) finish(true);
    };
    const abort = () => finish(false);
    const ping = () => {
      const currentUrl = url();
      if (!currentUrl) return;
      try { frame()?.postMessage({ type: "lifemark-preview-verify-revision", revision }, new URL(currentUrl).origin); } catch { /* reconnecting */ }
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    const pings = setInterval(ping, 250);
    host.addEventListener("message", onMessage);
    signal.addEventListener("abort", abort, { once: true });
    ping();
  });
}
