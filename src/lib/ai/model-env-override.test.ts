/**
 * Env overrides must go through the approved set.
 *
 * They did not. Every tier read `process.env.X || DEFAULT` directly, so an env
 * var could put ANY slug on ANY tier with nothing checking it — the approved set
 * gated the model picker and the router cascade but never the overrides.
 *
 * ai_eval_log showed what that cost: a $10/M in, $50/M out slug — twice the
 * price of the dearest model in the catalog — ran real production repairs
 * through an override while appearing in no catalog, no approved set, and no
 * cost report. Every test here fails against that.
 *
 *   node --experimental-strip-types --test src/lib/ai/model-env-override.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { OPENROUTER_MODEL_IDS } from "./openrouter-models.ts";
import { MODEL_CATALOG } from "./model-catalog.ts";
import { MODEL_PRICES } from "./model-prices.ts";

/** Not in the catalog, but priced — the escape hatch may allow this one. */
const UNAPPROVED_BUT_PRICED = "anthropic/claude-haiku-4.5";
/** Neither in the catalog nor priced — must not run under ANY configuration. */
const UNAPPROVED_AND_UNPRICED = "some-lab/unknown-model-9";

/**
 * The tier constants are module-level and read process.env once at import, so
 * they cannot be re-evaluated in-process. Resolve them in a child with a
 * controlled environment instead — the same way they resolve in production.
 */
function resolveEscalationModel(env: Record<string, string>): string {
  return execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "-e",
      'import("./src/lib/ai/model-defaults.ts").then((m) => process.stdout.write(m.ESCALATION_MODEL));',
    ],
    { env: { ...process.env, ...env }, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).trim();
}

describe("env overrides — approved set is a real boundary", () => {
  it("refuses an unapproved slug and falls back to the configured tier", () => {
    // THE REGRESSION. This is the shape of the production configuration that
    // was routing an off-catalog model. Against the old code the override wins.
    const model = resolveEscalationModel({ OPENROUTER_ESCALATION_MODEL: UNAPPROVED_BUT_PRICED });
    assert.notEqual(model, UNAPPROVED_BUT_PRICED, "an unapproved override must not take effect");
    assert.equal(model, "anthropic/claude-sonnet-5");
  });

  it("still honours an APPROVED override — this is a filter, not a wall", () => {
    // The escape hatch has to keep working or operators lose the ability to
    // repoint a tier without a deploy, which is the whole point of the vars.
    assert.equal(
      resolveEscalationModel({ OPENROUTER_ESCALATION_MODEL: "openai/gpt-5.6-terra" }),
      "openai/gpt-5.6-terra",
    );
  });

  it("allows an unapproved slug only when explicitly opted into", () => {
    // Default-deny with a NAMED way out. What is removed is the silent path,
    // not the capability.
    assert.equal(
      resolveEscalationModel({
        OPENROUTER_ESCALATION_MODEL: UNAPPROVED_BUT_PRICED,
        OPENROUTER_ALLOW_UNAPPROVED_MODELS: "true",
      }),
      UNAPPROVED_BUT_PRICED,
    );
  });

  it("treats any value other than the literal \"true\" as not opted in", () => {
    // "1", "yes" and "TRUE" are the usual near-misses. An operator who believes
    // they enabled the override and did not must get the safe tier, not a
    // surprise $50/M bill.
    for (const value of ["1", "yes", "TRUE", ""]) {
      assert.notEqual(
        resolveEscalationModel({
          OPENROUTER_ESCALATION_MODEL: UNAPPROVED_BUT_PRICED,
          OPENROUTER_ALLOW_UNAPPROVED_MODELS: value,
        }),
        UNAPPROVED_BUT_PRICED,
        `OPENROUTER_ALLOW_UNAPPROVED_MODELS=${JSON.stringify(value)} must not enable the override`,
      );
    }
  });

  it("ignores whitespace padding rather than silently missing the match", () => {
    // A trailing space in a dashboard env field would otherwise fail the Set
    // lookup and silently demote an APPROVED override to the fallback.
    assert.equal(
      resolveEscalationModel({ OPENROUTER_ESCALATION_MODEL: "  openai/gpt-5.6-terra  " }),
      "openai/gpt-5.6-terra",
    );
  });
});

describe("an unpriced model cannot be routed by any configuration", () => {
  // This is what replaced a hardcoded blocklist, and it is a better rule: a
  // model absent from MODEL_PRICES is one whose spend cannot be reported — it
  // bills real money and records cost_usd null — so allowing an override to it
  // is allowing invisible spend, which is the exact failure this gate exists to
  // prevent. Deleting a model's price entry is therefore sufficient to make it
  // unroutable, with no name hardcoded anywhere.
  it("refuses an unapproved, unpriced slug", () => {
    assert.equal(
      resolveEscalationModel({ OPENROUTER_ESCALATION_MODEL: UNAPPROVED_AND_UNPRICED }),
      "anthropic/claude-sonnet-5",
    );
  });

  it("refuses it EVEN WITH the escape hatch set", () => {
    // The distinction that makes the rule worth having. The hatch exists for an
    // operator who knows what they are doing; it is not a way to route spend
    // that no report can see.
    assert.equal(
      resolveEscalationModel({
        OPENROUTER_ESCALATION_MODEL: UNAPPROVED_AND_UNPRICED,
        OPENROUTER_ALLOW_UNAPPROVED_MODELS: "true",
      }),
      "anthropic/claude-sonnet-5",
    );
  });

  it("every model the gate can admit has a price", () => {
    // The approved path skips the price check entirely, so the guarantee only
    // holds if the catalog itself is fully priced.
    for (const id of OPENROUTER_MODEL_IDS) {
      assert.ok(MODEL_PRICES[id], `${id} is approved but unpriced`);
    }
    for (const model of MODEL_CATALOG) {
      assert.ok(MODEL_PRICES[model.id], `${model.id} is routable but unpriced`);
    }
  });
});
