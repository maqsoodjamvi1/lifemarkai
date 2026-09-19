import assert from "node:assert/strict";
import test from "node:test";
import { encodeBuildContent, transformBuildDocument } from "./build-content.ts";

test("stored HTML receives identical serving transforms with either encoding", () => {
  const html = '<html><head><script src="/assets/app.js"></script></head><body>\0</body></html>';
  for (const encoding of ["utf8", "base64"] as const) {
    const document = transformBuildDocument({
      path: "index.html", content: encoding === "base64" ? Buffer.from(html).toString("base64") : html,
      encoding, byteSize: Buffer.byteLength(html),
    }, (decoded) => decoded.replace('/assets/', '/preview-by-slug/test/assets/'));
    assert.equal(document.encoding, "utf8");
    assert.equal(document.content, html.replace('/assets/', '/preview-by-slug/test/assets/'));
    assert.equal(document.byteSize, Buffer.byteLength(document.content));
    assert.equal(document.path, "index.html");
  }
});

test("compiled text with NUL survives database JSON and decodes without changing bytes", () => {
  const source = 'const marker="\0";document.body.textContent="Café 🥐";';
  const stored = encodeBuildContent(source, "utf8");
  assert.equal(stored.encoding, "base64");
  assert.equal(stored.content.includes("\0"), false);
  const row = JSON.parse(JSON.stringify(stored));
  assert.deepEqual(Buffer.from(row.content, row.encoding), Buffer.from(source, "utf8"));
  assert.equal(row.byteSize, Buffer.byteLength(source));
});

test("ordinary text stays readable and existing binary assets retain exact sizes", () => {
  assert.deepEqual(encodeBuildContent("Café", "utf8"), { content: "Café", encoding: "utf8", byteSize: 5 });
  for (const bytes of [Buffer.from([0]), Buffer.from([0, 255]), Buffer.from([0, 255, 42])]) {
    const encoded = bytes.toString("base64");
    assert.deepEqual(encodeBuildContent(encoded, "base64"), {content: encoded, encoding: "base64", byteSize: bytes.length});
  }
});
