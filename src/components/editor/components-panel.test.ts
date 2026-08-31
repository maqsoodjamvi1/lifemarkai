import assert from "node:assert/strict";
import test from "node:test";
import { COMPONENTS, LIVE_PREVIEWS } from "./components-panel.tsx";

// Regression coverage for the "static catalog -> live-rendered preview" fix:
// LIVE_PREVIEWS is keyed by component NAME as a plain string (matched
// against component.name at render time), so a typo'd key silently never
// renders and nobody notices — there's no type error to catch a key that
// doesn't correspond to any catalog entry.
test("every LIVE_PREVIEWS key matches a real catalog entry name", () => {
  const catalogNames = new Set(COMPONENTS.map((c) => c.name));
  for (const key of Object.keys(LIVE_PREVIEWS)) {
    assert.ok(catalogNames.has(key), `LIVE_PREVIEWS key "${key}" does not match any COMPONENTS entry`);
  }
});

test("catalog names are unique, so a LIVE_PREVIEWS key can't ambiguously match more than one card", () => {
  const names = COMPONENTS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test("at least a meaningful fraction of the catalog has a real live preview, not just the emoji fallback", () => {
  const covered = COMPONENTS.filter((c) => LIVE_PREVIEWS[c.name]).length;
  assert.ok(covered >= 15, `expected at least 15 catalog entries with a live preview, got ${covered}`);
});
