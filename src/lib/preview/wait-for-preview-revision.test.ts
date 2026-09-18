import assert from "node:assert/strict";
import test from "node:test";
import { waitForPreviewRevision } from "./wait-for-preview-revision.ts";

function mockHost() {
  const listeners = new Set<(event: MessageEvent) => void>();
  return {
    listeners,
    host: {
      addEventListener(_type: string, handler: EventListener) {
        listeners.add(handler as (event: MessageEvent) => void);
      },
      removeEventListener(_type: string, handler: EventListener) {
        listeners.delete(handler as (event: MessageEvent) => void);
      },
    } satisfies Pick<Window, "addEventListener" | "removeEventListener">,
    emit(event: Pick<MessageEvent, "source" | "origin" | "data">) {
      for (const handler of listeners) handler(event as MessageEvent);
    },
  };
}

test("waitForPreviewRevision times out quickly instead of blocking a minute", async () => {
  const { host } = mockHost();
  const started = Date.now();
  const ok = await waitForPreviewRevision(
    "rev-1",
    () => null,
    () => "http://localhost:4173",
    new AbortController().signal,
    host,
    30,
  );
  assert.equal(ok, false);
  assert.ok(Date.now() - started < 2_000);
});

test("waitForPreviewRevision resolves when the current frame paints the matching revision", async () => {
  const frame = {} as Window;
  const { host, emit } = mockHost();
  const pending = waitForPreviewRevision(
    "rev-1",
    () => frame,
    () => "http://localhost:4173/",
    new AbortController().signal,
    host,
    2_000,
  );
  emit({
    source: frame,
    origin: "http://localhost:4173",
    data: { type: "lifemark-preview-revision-painted", revision: "rev-1" },
  });
  assert.equal(await pending, true);
});

test("waitForPreviewRevision ignores a paint from a different origin or revision", async () => {
  const frame = {} as Window;
  const { host, emit } = mockHost();
  const pending = waitForPreviewRevision(
    "rev-1",
    () => frame,
    () => "http://localhost:4173/",
    new AbortController().signal,
    host,
    40,
  );
  emit({
    source: frame,
    origin: "https://evil.test",
    data: { type: "lifemark-preview-revision-painted", revision: "rev-1" },
  });
  emit({
    source: frame,
    origin: "http://localhost:4173",
    data: { type: "lifemark-preview-revision-painted", revision: "old" },
  });
  assert.equal(await pending, false);
});

test("waitForPreviewRevision returns false when aborted", async () => {
  const { host } = mockHost();
  const controller = new AbortController();
  const pending = waitForPreviewRevision(
    "rev-1",
    () => null,
    () => "http://localhost:4173",
    controller.signal,
    host,
    2_000,
  );
  controller.abort();
  assert.equal(await pending, false);
});
