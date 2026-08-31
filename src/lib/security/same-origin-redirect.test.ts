import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isSameOriginRedirect } from "./same-origin-redirect.ts";

test("accepts a URL that shares scheme+host+port with the app URL", () => {
  assert.equal(isSameOriginRedirect("https://myapp.lifemarkai.app/thanks", "https://myapp.lifemarkai.app"), true);
  assert.equal(isSameOriginRedirect("https://myapp.lifemarkai.app/thanks?x=1", "https://myapp.lifemarkai.app/anything"), true);
});

test("rejects a different host, even a convincing-looking one", () => {
  assert.equal(isSameOriginRedirect("https://myapp-lifemarkai.app.evil.example/thanks", "https://myapp.lifemarkai.app"), false);
  assert.equal(isSameOriginRedirect("https://evil.example", "https://myapp.lifemarkai.app"), false);
});

test("rejects a scheme or port mismatch", () => {
  assert.equal(isSameOriginRedirect("http://myapp.lifemarkai.app", "https://myapp.lifemarkai.app"), false);
  assert.equal(isSameOriginRedirect("https://myapp.lifemarkai.app:8443", "https://myapp.lifemarkai.app"), false);
});

test("rejects undefined, empty, and unparseable candidates", () => {
  assert.equal(isSameOriginRedirect(undefined, "https://myapp.lifemarkai.app"), false);
  assert.equal(isSameOriginRedirect("", "https://myapp.lifemarkai.app"), false);
  assert.equal(isSameOriginRedirect("not a url", "https://myapp.lifemarkai.app"), false);
  assert.equal(isSameOriginRedirect("javascript:alert(1)", "https://myapp.lifemarkai.app"), false);
});
