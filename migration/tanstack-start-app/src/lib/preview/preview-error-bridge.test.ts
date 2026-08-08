import test from "node:test";
import assert from "node:assert/strict";
import {
isBrowserExtensionError,
isDocumentHydrationMismatch,
isMinifiedReactHydrationError,
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

// ── A multi-chain wallet extension, captured verbatim from a real console ────
//
// The extension patches postMessage/setImmediate, so React's scheduler runs
// through its shim and every React error arrives wearing `inpage.js` frames.
// None of these stacks contain a wallet word, which is exactly why the old
// two-condition check let them through.

const WALLET_STACK = [
  "at dl (index-noHQJE9c.js:7:4806)",
  "at Qf (index-noHQJE9c.js:9:45905)",
  "at Wf (index-noHQJE9c.js:9:39988)",
  "at zf (index-noHQJE9c.js:9:34900)",
  "at U (index-noHQJE9c.js:2:9832)",
  "at de (index-noHQJE9c.js:2:10209)",
  "at run (inpage.js:1:1898085)",
  "at runIfPresent (inpage.js:1:1898212)",
  "at onGlobalMessage (inpage.js:1:1897412)",
].join("\n");

const MINIFIED_418 =
  "Uncaught Error: Minified React error #418; visit https://reactjs.org/docs/error-decoder.html?invariant=418 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
const MINIFIED_423 =
  "Uncaught Error: Minified React error #423; visit https://reactjs.org/docs/error-decoder.html?invariant=423 for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";

test("a stack through inpage.js is an extension error even with no wallet word", () => {
  assert.equal(isBrowserExtensionError(MINIFIED_418, { stack: WALLET_STACK }), true);
  assert.equal(isNoisePreviewError(MINIFIED_418, { stack: WALLET_STACK }), true);
});

test("the wallet's own adapter errors are extension errors", () => {
  const msg = "ERROR Error: IN_PAGE_CHANNEL_NODE_ID in-page-channel-node-id not found";
  const stack = [
    "at ExtendedBroadcastMessage.initBroadcastMessage (inpage.js:1:49684)",
    "at EthereumAdapter.setChainId (inpage.js:1:1177205)",
    "at ProvidersManager.start (inpage.js:1:51355)",
  ].join("\n");
  assert.equal(isBrowserExtensionError(msg, { stack }), true);
  assert.equal(isNoisePreviewError(msg, { stack }), true);
});

test("adapter names alone survive a truncated stack", () => {
  // Console output is often cut off before the frame that named the file.
  assert.equal(isBrowserExtensionError("at SolanaAdapter.start (…)"), true);
  assert.equal(isBrowserExtensionError("at TronAdapter.registerEventListeners"), true);
  assert.equal(isBrowserExtensionError("BinanceWeb3Provider.registerEventListeners"), true);
});

test("minified hydration codes are not actionable and are suppressed", () => {
  for (const msg of [MINIFIED_418, MINIFIED_423]) {
    assert.equal(isMinifiedReactHydrationError(msg), true, msg);
    assert.equal(isNoisePreviewError(msg), true, msg);
  }
  assert.equal(
    isMinifiedReactHydrationError("Minified React error #422"),
    true,
  );
});

test("minified TEXT-mismatch (#425) stays actionable — that one is a real app bug", () => {
  const msg = "Minified React error #425; visit https://reactjs.org/docs/error-decoder.html?invariant=425";
  assert.equal(isMinifiedReactHydrationError(msg), false);
  assert.equal(isNoisePreviewError(msg), false);
});

test("other minified React errors are not swallowed", () => {
  // #310 is "Rendered more hooks than during the previous render" — a real bug
  // the fixer should see.
  const msg = "Minified React error #310; visit https://reactjs.org/docs/error-decoder.html?invariant=310";
  assert.equal(isMinifiedReactHydrationError(msg), false);
  assert.equal(isNoisePreviewError(msg), false);
});

test("a normal app file is never mistaken for an extension", () => {
  const stack = [
    "at Dashboard (/src/pages/Dashboard.tsx:12:5)",
    "at main (/src/main.tsx:6:1)",
  ].join("\n");
  assert.equal(isBrowserExtensionError("TypeError: x is not a function", { stack }), false);
  assert.equal(isNoisePreviewError("TypeError: x is not a function", { stack }), false);
});
