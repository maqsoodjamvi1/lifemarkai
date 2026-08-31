import test from "node:test";
import assert from "node:assert/strict";

import { buildStaticPreview } from "../preview/build-static-preview.ts";
import { verifyPreviewHtml } from "./preview-verify.ts";

test("accepts a vanilla app whose JavaScript populates an empty root", () => {
  const html = buildStaticPreview([
    {
      path: "index.html",
      content: '<!doctype html><html><body><div id="root"></div><script src="app.js"></script></body></html>',
    },
    {
      path: "app.js",
      content: 'document.getElementById("root").innerHTML = "<main>Working app</main>";',
    },
  ]);

  const result = verifyPreviewHtml(html);
  assert.equal(result.ok, true, JSON.stringify(result.checks));
  assert.equal(result.checks.find((check) => check.name === "Render bootstrap present")?.pass, true);
});

test("still rejects an empty framework shell with no renderer", () => {
  const result = verifyPreviewHtml(
    '<!doctype html><html><body><div id="root"></div></body></html>',
  );

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.name === "Render bootstrap present")?.pass, false);
});
