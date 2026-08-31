import { strict as assert } from "node:assert";
import { test } from "node:test";
import { downloadBlob } from "./download-blob.ts";

// No jsdom in this test runner — stub just enough of the browser download
// surface (Blob/URL/document) to verify downloadBlob wires them together
// correctly, without pulling in a full DOM.
function withStubbedDom<T>(run: () => T): { result: T; clicked: boolean; anchor: { href: string; download: string } } {
  const anchor = { href: "", download: "", click() { clicked = true; } };
  let clicked = false;
  const g = globalThis as unknown as Record<string, unknown>;
  const prevBlob = g.Blob;
  const prevURL = g.URL;
  const prevDocument = g.document;
  g.Blob = class {
    parts: unknown[];
    type: string;
    constructor(parts: unknown[], opts: { type: string }) {
      this.parts = parts;
      this.type = opts.type;
    }
  };
  g.URL = { createObjectURL: () => "blob:stub-url", revokeObjectURL: () => {} };
  g.document = { createElement: () => anchor };

  try {
    const result = run();
    return { result, clicked, anchor };
  } finally {
    g.Blob = prevBlob;
    g.URL = prevURL;
    g.document = prevDocument;
  }
}

test("downloadBlob creates an object URL, clicks a download anchor, and revokes the URL", () => {
  const { clicked, anchor } = withStubbedDom(() =>
    downloadBlob("hello world", "text/plain", "greeting.txt"),
  );
  assert.equal(clicked, true);
  assert.equal(anchor.download, "greeting.txt");
  assert.equal(anchor.href, "blob:stub-url");
});
