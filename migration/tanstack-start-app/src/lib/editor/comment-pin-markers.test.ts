import { test } from "node:test";
import assert from "node:assert/strict";
import {
commentPinLabel,
computeMarkerPosition,
filterPinsForPage,
normalizeXpath,
toCommentPinList,
} from "./comment-pin-markers.ts";

test("commentPinLabel truncates to 80 chars and falls back to an index label", () => {
  assert.equal(commentPinLabel("fix this button", 0), "fix this button");
  assert.equal(commentPinLabel("x".repeat(200), 0).length, 80);
  assert.equal(commentPinLabel(null, 0), "Comment 1");
  assert.equal(commentPinLabel("", 4), "Comment 5");
  assert.equal(commentPinLabel(undefined, 2), "Comment 3");
});

test("filterPinsForPage matches exact page, wildcard, and unset", () => {
  const rows = [
    { id: "a", element_xpath: "//div", page_path: "/" },
    { id: "b", element_xpath: "//div", page_path: "/about" },
    { id: "c", element_xpath: "//div", page_path: "*" },
    { id: "d", element_xpath: "//div", page_path: null },
    { id: "e", element_xpath: "//div" },
  ];
  assert.deepEqual(filterPinsForPage(rows, "/").map((r) => r.id), ["a", "c", "d", "e"]);
  assert.deepEqual(filterPinsForPage(rows, "/about").map((r) => r.id), ["b", "c", "d", "e"]);
  assert.deepEqual(filterPinsForPage(rows, "/contact").map((r) => r.id), ["c", "d", "e"]);
});

test("toCommentPinList maps rows and never emits a null xpath", () => {
  const pins = toCommentPinList([
    { id: "a", element_xpath: "//button[1]", content: "wrong color" },
    { id: "b", element_xpath: null, content: null },
  ]);
  assert.deepEqual(pins, [
    { id: "a", xpath: "//button[1]", label: "wrong color" },
    { id: "b", xpath: "", label: "Comment 2" },
  ]);
});

test("normalizeXpath adds the leading axis exactly once", () => {
  assert.equal(normalizeXpath("//div[1]"), "//div[1]");
  assert.equal(normalizeXpath("div[1]"), "//div[1]");
});

test("computeMarkerPosition anchors the badge to the element's top-right corner", () => {
  const pos = computeMarkerPosition(
    { left: 100, top: 50 },
    { left: 20, top: 30, width: 200, height: 40 },
  );
  assert.deepEqual(pos, { left: 100 + 20 + 200 - 10, top: 50 + 30 - 10 });
});
