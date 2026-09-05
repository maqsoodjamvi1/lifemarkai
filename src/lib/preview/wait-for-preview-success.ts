/** Docker first-boot can take a minute; do not screenshot the previous origin. */
export const GENERATION_PREVIEW_WAIT_MS = 90_000;

export type PreviewWaitHost = Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent">;

type SettleRecord = { ok: boolean; at: number };

/** Last announced settle — used to close the "iframe already loaded" race. */
let lastSettle: SettleRecord | null = null;

/** How far back a prior `ok` settle still counts as the current preview. */
const RECENT_SETTLE_MS = 2_000;

export function announcePreviewSettled(
  ok: boolean,
  host: PreviewWaitHost = typeof window === "undefined" ? new EventTarget() : window,
): void {
  lastSettle = { ok, at: Date.now() };
  host.dispatchEvent(new CustomEvent("lifemark-preview-settled", { detail: { ok } }));
}

export function clearPreviewSettled(): void {
  lastSettle = null;
}

/**
 * Resolve when the owning preview panel announces a validated render using
 * `lifemark-preview-settled`. Connectivity and raw guest messages are insufficient.
 * A failed settle (`ok: false`) is ignored so a later successful sync can still win.
 *
 * `notBeforeMs` (epoch ms) ignores settles from a previous generation so a
 * still-visible iframe cannot count as the new preview.
 * Without it, an `ok` settle from the last `RECENT_SETTLE_MS` is accepted
 * immediately (heal attaching after srcdoc already painted).
 */
export function waitForPreviewSuccess(
  timeoutMs = 10_000,
  host: PreviewWaitHost = typeof window === "undefined" ? new EventTarget() : window,
  notBeforeMs?: number,
): Promise<boolean> {
  const isCurrent = (at: number) =>
    typeof notBeforeMs === "number" ? at >= notBeforeMs : Date.now() - at <= RECENT_SETTLE_MS;

  return new Promise((resolve) => {
    if (lastSettle?.ok && isCurrent(lastSettle.at)) {
      resolve(true);
      return;
    }

    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      host.removeEventListener("lifemark-preview-settled", onSettled as EventListener);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);

    function onSettled(event: Event) {
      if ((event as CustomEvent<{ ok?: boolean }>).detail?.ok !== true) return;
      if (typeof notBeforeMs === "number" && Date.now() < notBeforeMs) return;
      finish(true);
    }

    // Only the owning preview panel can validate iframe origin and revision.
    // Raw bridge/lifecycle messages prove connectivity, not updated rendering.
    host.addEventListener("lifemark-preview-settled", onSettled as EventListener);
  });
}
