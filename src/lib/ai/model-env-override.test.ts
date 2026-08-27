/**
 * Env overrides must go through the approved set.
 *
 * They did not. Every tier read `process.env.X || DEFAULT` directly, so an env
 * var could put ANY slug on ANY tier with nothing checking it — the approved set
 * gated the model picker and the router cascade but never the overrides.
 *
 * ai_eval_log shows what that cost: anthropic/claude-fable-5 ($10/M in, $50/M
 * out — twice Opus 5, the priciest slug this product has routed) ran real
 * production repairs through an override while appearing in no catalog, no
 * approved set, and no cost report. Every test here fails against that.
 *
 *   node --experimental-strip-types --test src/lib/ai/model-env-override.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const UNAPPROVED = "anthropic/claude-fable-5";

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
    // THE REGRESSION. This is the exact production configuration that was
    // routing fable-5. Against the old code it returns fable-5.
    const model = resolveEscalationModel({ OPENROUTER_ESCALATION_MODEL: UNAPPROVED });
    assert.notEqual(model, UNAPPROVED, "an unapproved override must not take effect");
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
        OPENROUTER_ESCALATION_MODEL: UNAPPROVED,
        OPENROUTER_ALLOW_UNAPPROVED_MODELS: "true",
      }),
      UNAPPROVED,
    );
  });

  it("treats any value other than the literal \"true\" as not opted in", () => {
    // "1", "yes" and "TRUE" are the usual near-misses. An operator who believes
    // they enabled the override and did not must get the safe tier, not a
    // surprise $50/M bill.
    for (const value of ["1", "yes", "TRUE", ""]) {
      assert.notEqual(
        resolveEscalationModel({
          OPENROUTER_ESCALATION_MODEL: UNAPPROVED,
          OPENROUTER_ALLOW_UNAPPROVED_MODELS: value,
        }),
        UNAPPROVED,
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
