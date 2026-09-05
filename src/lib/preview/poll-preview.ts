/** Keep boot detection responsive without continuously probing a healthy app. */
export function previewPollDelay(bootPending: boolean): number {
  return bootPending ? 1200 : 15_000;
}

/** Serial polling: slow requests cannot stack up; cleanup aborts pending work. */
export function pollPreview(
  poll: (signal: AbortSignal) => Promise<unknown>,
  delay: number,
  isHidden: () => boolean = () => false,
): () => void {
  let stopped = false;
  let controller: AbortController | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    if (stopped) return;
    if (!isHidden()) {
      controller = new AbortController();
      timeout = setTimeout(() => controller?.abort(), 15_000);
      try {
        await poll(controller.signal);
      } catch {
        // A transient failure must not disable subsequent recovery polls.
      } finally {
        clearTimeout(timeout);
      }
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };
  timer = setTimeout(tick, delay);
  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(timeout);
    controller?.abort();
  };
}
