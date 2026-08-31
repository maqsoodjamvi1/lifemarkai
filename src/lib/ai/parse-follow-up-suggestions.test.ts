import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFollowUpSuggestions } from "./parse-follow-up-suggestions";

test("parses one-suggestion-per-line output", () => {
  const raw = "Add a search bar to the product list\nAdd pagination to the orders table\nAdd a CSV export button";
  assert.deepEqual(parseFollowUpSuggestions(raw), [
    "Add a search bar to the product list",
    "Add pagination to the orders table",
    "Add a CSV export button",
  ]);
});

test("strips bullet, dash, and numbered-list markers", () => {
  const raw = "- Add dark mode\n* Add a loading spinner\n1. Add keyboard shortcuts\n2) Add undo support";
  assert.deepEqual(parseFollowUpSuggestions(raw, 4), [
    "Add dark mode",
    "Add a loading spinner",
    "Add keyboard shortcuts",
    "Add undo support",
  ]);
});

test("strips wrapping quotes", () => {
  const raw = '"Add a confirmation dialog"\n\'Add form validation\'';
  assert.deepEqual(parseFollowUpSuggestions(raw), ["Add a confirmation dialog", "Add form validation"]);
});

test("drops preamble/commentary lines", () => {
  const raw = "Here are 3 follow-up suggestions:\nAdd a settings page\nSuggestions:\nAdd a help modal";
  assert.deepEqual(parseFollowUpSuggestions(raw), ["Add a settings page", "Add a help modal"]);
});

test("drops empty lines and overly long lines (likely full sentences, not chips)", () => {
  const raw = "\n\nAdd a share button\n" + "x".repeat(120) + "\nAdd a print view";
  assert.deepEqual(parseFollowUpSuggestions(raw), ["Add a share button", "Add a print view"]);
});

test("dedupes identical suggestions", () => {
  const raw = "Add dark mode\nAdd dark mode\nAdd light mode";
  assert.deepEqual(parseFollowUpSuggestions(raw), ["Add dark mode", "Add light mode"]);
});

test("caps at max", () => {
  const raw = "One\nTwo\nThree\nFour\nFive";
  assert.equal(parseFollowUpSuggestions(raw, 3).length, 3);
  assert.deepEqual(parseFollowUpSuggestions(raw, 3), ["One", "Two", "Three"]);
});

test("returns an empty array for empty or whitespace-only input", () => {
  assert.deepEqual(parseFollowUpSuggestions(""), []);
  assert.deepEqual(parseFollowUpSuggestions("   \n  \n "), []);
});
