import assert from "node:assert/strict";
import test from "node:test";
import { resolveSafeRedirect, withAuthRedirect } from "./safe-redirect";

test("resolveSafeRedirect preserves deep local paths", () => {
  assert.equal(
    resolveSafeRedirect("/editor/123?prompt=hello%20world#preview"),
    "/editor/123?prompt=hello%20world#preview",
  );
});

test("resolveSafeRedirect permits an absolute URL only on the allowed origin", () => {
  assert.equal(
    resolveSafeRedirect(
      "https://app.example.com/editor/123?mode=plan",
      "/dashboard",
      "https://app.example.com",
    ),
    "/editor/123?mode=plan",
  );
  assert.equal(
    resolveSafeRedirect(
      "https://evil.example/editor/123",
      "/dashboard",
      "https://app.example.com",
    ),
    "/dashboard",
  );
});

test("resolveSafeRedirect rejects protocol-relative and backslash redirects", () => {
  assert.equal(resolveSafeRedirect("//evil.example/path"), "/dashboard");
  assert.equal(resolveSafeRedirect("/\\evil.example/path"), "/dashboard");
  assert.equal(resolveSafeRedirect("javascript:alert(1)"), "/dashboard");
});

test("withAuthRedirect safely encodes nested query parameters", () => {
  assert.equal(
    withAuthRedirect("/login", "/accept-invite?teamId=one&memberId=two"),
    "/login?next=%2Faccept-invite%3FteamId%3Done%26memberId%3Dtwo",
  );
});
