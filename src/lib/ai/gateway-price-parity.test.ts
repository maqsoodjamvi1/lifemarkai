/**
 * The app and the gateway must price the same model the same way.
 *
 * gateway/src/index.ts carries its own TOKEN_COST_MAP, under a comment in
 * scripts/eval-models.mjs asking for it to be kept in step by hand. Unlike the
 * other duplicates fixed in this branch, this one genuinely CANNOT share a
 * module: the gateway is a separate Cloudflare Worker with its own bundle and
 * no path back into src/. So the enforcement has to be a test.
 *
 * It is worth enforcing because the failure is silent and financial. The
 * gateway's table was once stamped "as of 2025-05" and was wrong by up to 6x in
 * BOTH directions — deepseek-v4-pro under by ~2.4x, per the note still in that
 * file. Nothing failed; the spend reports were simply wrong, in a way no test
 * and no error message would ever surface.
 *
 * Scoped to models the app can actually ROUTE to. The gateway lists many more,
 * which is fine — an extra entry costs nothing, a MISSING or WRONG one bills
 * incorrectly.
 *
 *   node --import tsx --test src/lib/ai/gateway-price-parity.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { MODEL_PRICES } from "./model-prices.ts";
import { MODEL_CATALOG } from "./model-catalog.ts";
import { OPENROUTER_MODEL_IDS } from "./openrouter-models.ts";
import {
  DEFAULT_CODING_MODEL,
  DIAGNOSIS_MODEL,
  ESCALATION_MODEL,
  PREMIUM_CODING_MODEL,
  FAST_CODING_MODEL,
  ECONOMY_CODING_MODEL,
  REVIEW_MODEL,
  FREE_CODING_MODEL,
  DEFAULT_CHAT_MODEL,
} from "./model-defaults.ts";

const here = dirname(fileURLToPath(import.meta.url));
const GATEWAY = join(here, "../../../gateway/src/index.ts");

function gatewayPrices(): Record<string, [number, number]> {
  const src = readFileSync(GATEWAY, "utf8");
  const start = src.indexOf("const TOKEN_COST_MAP");
  assert.ok(start >= 0, "TOKEN_COST_MAP not found — did the gateway move?");
  const body = src.slice(start, src.indexOf("\n};", start));
  const out: Record<string, [number, number]> = {};
  for (const m of body.matchAll(/"([^"]+)":\s*\[\s*([\d.]+),\s*([\d.]+)\s*\]/g)) {
    out[m[1]] = [parseFloat(m[2]), parseFloat(m[3])];
  }
  assert.ok(Object.keys(out).length > 10, "parsed suspiciously few gateway prices");
  return out;
}

/** Every model a request can actually be routed to. */
const ROUTABLE = [
  ...new Set([
    ...OPENROUTER_MODEL_IDS,
    ...MODEL_CATALOG.map((m) => m.id),
    DEFAULT_CODING_MODEL, DIAGNOSIS_MODEL, ESCALATION_MODEL, PREMIUM_CODING_MODEL,
    FAST_CODING_MODEL, ECONOMY_CODING_MODEL, REVIEW_MODEL, FREE_CODING_MODEL,
    DEFAULT_CHAT_MODEL,
  ]),
];

describe("gateway price parity", () => {
  it("prices every routable model, at the same rate as the app", () => {
    const gw = gatewayPrices();
    const missing: string[] = [];
    const wrong: string[] = [];
    for (const id of ROUTABLE) {
      const app = (MODEL_PRICES as Record<string, [number, number]>)[id];
      assert.ok(app, `${id} is routable but has no app price`);
      const g = gw[id];
      if (!g) { missing.push(id); continue; }
      if (g[0] !== app[0] || g[1] !== app[1]) {
        wrong.push(`${id}: gateway ${g[0]}/${g[1]} vs app ${app[0]}/${app[1]}`);
      }
    }
    assert.deepEqual(missing, [], "gateway cannot price these — their spend bills as unknown");
    assert.deepEqual(wrong, [], "gateway and app disagree on price");
  });

  it("parses the gateway table rather than silently matching nothing", () => {
    // If the gateway is refactored and the regex stops matching, the test above
    // would pass vacuously. This is the canary for that.
    const gw = gatewayPrices();
    assert.ok(gw[DEFAULT_CODING_MODEL], `parser did not find ${DEFAULT_CODING_MODEL}`);
    assert.ok(gw[ESCALATION_MODEL], `parser did not find ${ESCALATION_MODEL}`);
  });
});
