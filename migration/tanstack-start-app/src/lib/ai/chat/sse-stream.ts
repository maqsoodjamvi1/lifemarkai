export interface StreamSink {
  safeEnqueue: (chunk: Uint8Array) => boolean;
  safeClose: () => void;
  isClientGone: () => boolean;
}

/** Keeps streaming routes safe when the browser disconnects mid-generation. */
export function createStreamSink(
  controller: ReadableStreamDefaultController<Uint8Array>,
  _encoder: TextEncoder,
  signal: AbortSignal,
  onDisconnect?: () => void,
): StreamSink {
  let clientDisconnected = signal.aborted;
  const onAbort = () => {
    clientDisconnected = true;
    onDisconnect?.();
  };
  signal.addEventListener("abort", onAbort);

  const safeEnqueue = (chunk: Uint8Array): boolean => {
    if (clientDisconnected) return false;
    try {
      controller.enqueue(chunk);
      return true;
    } catch {
      clientDisconnected = true;
      return false;
    }
  };

  const safeClose = () => {
    signal.removeEventListener("abort", onAbort);
    if (clientDisconnected) return;
    try {
      controller.close();
    } catch {
      // The runtime may already have closed the stream.
    }
    clientDisconnected = true;
  };

  return { safeEnqueue, safeClose, isClientGone: () => clientDisconnected };
}
