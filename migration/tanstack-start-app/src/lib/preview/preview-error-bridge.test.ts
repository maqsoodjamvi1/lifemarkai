import test from "node:test";
import assert from "node:assert/strict";
import {
  isDocumentHydrationMismatch,
  isNoisePreviewError,
} from "./preview-error-bridge.ts";

/**
 * The exact strings a customer reported seeing on every preview load of a
 * TanStack Start project. Asserted verbatim: if a React version rephrases one
 * of these, this file should fail rather than quietly start looping again.
 */
const REPORTED = [
  "Warning: Expected server HTML to contain a matching <head> in <html>.",
  "Warning: Expected server HTML to contain a matching <%s> in <%s>.%s head html",
  "Uncaught Error: Hydration failed because the initial UI does not match what was rendered on the server.",
  "Hydration failed because the initial UI does not match what was rendered on the server.",
  "Warning: An error occurred during hydration. The server HTML was replaced with client content in <%s>. #document",
  "Warning: An error occurred during hydration. The server HTML was replaced with client content in <#document>.",
];

test("every reported document-level hydration message is treated as noise", () => {
  for (const msg of REPORTED) {
    assert.equal(isDocumentHydrationMismatch(msg), true, msg);
    assert.equal(isNoisePreviewError(msg), true, msg);
  }
});

test("a body-level mismatch is document-level too", () => {
  assert.equal(
    isDocumentHydrationMismatch("Expected server HTML to contain a matching <body> in <html>."),
    true,
  );
});

// ── The narrowness is the point: real app bugs must still get through ───────

test("a content-level hydration mismatch is NOT suppressed", () => {
  // This one the AI genuinely can fix — it is Date.now() or localStorage in
  // render, and it names page content rather than the document shell.
  const contentLevel =
    'Warning: Text content did not match. Server: "12:01" Client: "12:02" during hydration in <span>';
  assert.equal(isDocumentHydrationMismatch(contentLevel), false);
  assert.equal(isNoisePreviewError(contentLevel), false);
});

test("a div-level hydration mismatch is NOT suppressed", () => {
  const msg = "Expected server HTML to contain a matching <div> in <div>.";
  assert.equal(isDocumentHydrationMismatch(msg), false);
  assert.equal(isNoisePreviewError(msg), false);
});

test("an unrelated error mentioning head or html is NOT suppressed", () => {
  // No hydration wording, so the shell-tag test must never fire on its own.
  for (const msg of [
    "TypeError: Cannot read properties of undefined (reading 'head')",
    "SyntaxError: Unexpected token '<' in <html>",
    "Failed to compile: Unexpected closing tag </body>",
  ]) {
    assert.equal(isDocumentHydrationMismatch(msg), false, msg);
    assert.equal(isNoisePreviewError(msg), false, msg);
  }
});

test("a plain runtime error is still actionable", () => {
  const msg = "TypeError: users.map is not a function";
  assert.equal(isNoisePreviewError(msg), false);
});

test("empty and placeholder messages stay noise", () => {
  for (const msg of ["", "   ", "{}", "[]", "[object Object]"]) {
    assert.equal(isNoisePreviewError(msg), true, JSON.stringify(msg));
  }
});
