import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isBlockedPreviewAssetPath } from "./sensitive-asset-path.ts";

test("blocks .env.local and other dotfiles at the root", () => {
  assert.equal(isBlockedPreviewAssetPath(".env.local"), true);
  assert.equal(isBlockedPreviewAssetPath(".env"), true);
  assert.equal(isBlockedPreviewAssetPath(".git/config"), true);
  assert.equal(isBlockedPreviewAssetPath(".htaccess"), true);
});

test("blocks a dotfile nested under an otherwise normal path", () => {
  assert.equal(isBlockedPreviewAssetPath("src/.env.local"), true);
  assert.equal(isBlockedPreviewAssetPath("config/.secrets/keys.json"), true);
});

test("blocks a leading-slash or backslash variant of the same path", () => {
  assert.equal(isBlockedPreviewAssetPath("/.env.local"), true);
  assert.equal(isBlockedPreviewAssetPath("\\.env.local"), true);
});

test("does not block ordinary asset paths", () => {
  assert.equal(isBlockedPreviewAssetPath("src/App.tsx"), false);
  assert.equal(isBlockedPreviewAssetPath("public/logo.png"), false);
  assert.equal(isBlockedPreviewAssetPath("dist/assets/index-abc123.js"), false);
  assert.equal(isBlockedPreviewAssetPath("index.html"), false);
});

test("does not block a filename that merely contains a dot, only a leading one", () => {
  assert.equal(isBlockedPreviewAssetPath("styles.module.css"), false);
  assert.equal(isBlockedPreviewAssetPath("v1.2.3/notes.txt"), false);
});
