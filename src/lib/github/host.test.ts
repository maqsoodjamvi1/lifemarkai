import assert from "node:assert/strict";
import { test } from "node:test";
import {
  githubHtmlOrigin,
  githubOAuthAuthorizeUrl,
  githubRepoHtmlUrl,
  normalizeGitHubApiBase,
  normalizeGitHubWebOrigin,
} from "./host.ts";

test("normalizeGitHubApiBase treats github.com as the public API", () => {
  assert.equal(normalizeGitHubApiBase("https://github.com"), null);
  assert.equal(normalizeGitHubApiBase("https://api.github.com"), null);
  assert.equal(normalizeGitHubApiBase(""), null);
  assert.equal(normalizeGitHubApiBase(null), null);
});

test("normalizeGitHubApiBase maps a GHE host to /api/v3", () => {
  assert.equal(
    normalizeGitHubApiBase("https://github.acme.internal"),
    "https://github.acme.internal/api/v3",
  );
  assert.equal(
    normalizeGitHubApiBase("https://github.acme.internal/api/v3"),
    "https://github.acme.internal/api/v3",
  );
});

test("normalizeGitHubApiBase rejects http, credentials, and metadata hosts", () => {
  assert.equal(normalizeGitHubApiBase("http://github.acme.internal"), null);
  assert.equal(normalizeGitHubApiBase("https://user:pass@github.acme.internal"), null);
  assert.equal(normalizeGitHubApiBase("https://169.254.169.254"), null);
  assert.equal(normalizeGitHubApiBase("https://localhost"), null);
});

test("normalizeGitHubWebOrigin maps GHE and github.com", () => {
  assert.equal(normalizeGitHubWebOrigin("https://github.acme.internal"), "https://github.acme.internal");
  assert.equal(normalizeGitHubWebOrigin("https://github.com"), "https://github.com");
  assert.equal(normalizeGitHubWebOrigin("https://api.github.com"), "https://github.com");
});

test("githubHtmlOrigin and githubRepoHtmlUrl use the GHE site origin", () => {
  assert.equal(githubHtmlOrigin(null), "https://github.com");
  assert.equal(githubHtmlOrigin("https://github.acme.internal/api/v3"), "https://github.acme.internal");
  assert.equal(
    githubRepoHtmlUrl("acme/app", "https://github.acme.internal/api/v3"),
    "https://github.acme.internal/acme/app",
  );
});

test("githubOAuthAuthorizeUrl points at the GHE login host", () => {
  assert.equal(
    githubOAuthAuthorizeUrl("https://github.acme.internal"),
    "https://github.acme.internal/login/oauth/authorize",
  );
  assert.equal(
    githubOAuthAuthorizeUrl("https://github.com"),
    "https://github.com/login/oauth/authorize",
  );
});
