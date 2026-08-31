import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CONNECTORS as WIZARD_CONNECTORS } from "@/components/editor/connector-wizard-panel";
import { CONNECTORS as APP_CONNECTORS } from "@/components/editor/app-connectors-panel";

/**
 * Two independent connector catalogs exist by design, not by accident:
 *
 * - app-connectors-panel.tsx's CONNECTORS (136 entries) is the full
 *   OAuth/API-key connection system, actually wired to project env vars.
 * - connector-wizard-panel.tsx's CONNECTORS (37 entries) is a narrower
 *   "copy these env vars + here's a setup guide + an AI prompt to wire it
 *   up" helper aimed at a smaller set of popular integrations.
 *
 * A fragility audit considered merging them into one data model and
 * rejected it: they use different Connector shapes for genuinely
 * different UX (different category taxonomies drive each panel's own
 * filter pills), and forcing them together risks breaking either panel's
 * filtering with no way to visually verify the result.
 *
 * IMPORTANT — id collision that looks like a bug but isn't: both
 * catalogs have an entry with id "openai", but they mean different
 * things. In connector-wizard-panel.tsx it's "Managed AI" — LifemarkAI's
 * own no-key-required AI gateway (envVars: []). In app-connectors-panel.tsx
 * it's literally OpenAI — bring your own OPENAI_API_KEY. They are not the
 * same connector and must not be reconciled to share a name; this is
 * flagged here specifically so a future reader doesn't "fix" it.
 *
 * What this test actually guards: each catalog's own ids stay unique
 * within itself. A duplicate id inside one catalog silently means the
 * later entry always wins wherever the array is looked up by id — a real
 * bug the array's own type doesn't prevent.
 */

function duplicateIds(connectors: { id: string }[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const c of connectors) {
    if (seen.has(c.id)) dupes.add(c.id);
    seen.add(c.id);
  }
  return [...dupes];
}

test("app-connectors-panel's CONNECTORS has no duplicate ids", () => {
  assert.deepEqual(duplicateIds(APP_CONNECTORS), []);
});

test("connector-wizard-panel's CONNECTORS has no duplicate ids", () => {
  assert.deepEqual(duplicateIds(WIZARD_CONNECTORS), []);
});

test("the known 'openai' id collision is still the two different connectors it's documented as (catches an accidental future rename)", () => {
  const wizardOpenAi = WIZARD_CONNECTORS.find((c) => c.id === "openai");
  const appOpenAi = APP_CONNECTORS.find((c) => c.id === "openai");
  assert.equal(wizardOpenAi?.name, "Managed AI");
  assert.equal(appOpenAi?.name, "OpenAI");
});
