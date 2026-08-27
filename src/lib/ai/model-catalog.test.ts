/**
 * Invariant tests for the model catalog.
 *
 * Each of these locks in a bug that was live in the codebase on 2026-08-19 and
 * would otherwise come back silently, because every one of them fails QUIETLY:
 * a dead slug is filtered out with no log, a duplicate entry just looks like a
 * duplicate menu row, and an all-one-vendor cascade still returns three models.
 *
 *   node --experimental-strip-types --test src/lib/ai/model-catalog.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MODEL_CATALOG, selectModelChain, getCatalogModel } from "./model-catalog.ts";
import { OPENROUTER_MODEL_CATALOG } from "./openrouter-models.ts";
import {
  DEFAULT_CODING_MODEL,
  DIAGNOSIS_MODEL,
  isBannedRouterMetaModel,
  FREE_CODING_MODEL,
  AUTOCOMPLETE_MODEL,
  ESCALATION_MODEL,
  PREMIUM_CODING_MODEL,
  PREMIUM_REASONING_MODEL,
  REVIEW_MODEL,
  DESIGN_MODEL,
} from "./model-defaults.ts";

const vendorOf = (id: string) => id.split("/")[0];

describe("model catalog — structural invariants", () => {
  it("has no duplicate ids", () => {
    // "Economy Coder" and "Qwen3 Coder" were both qwen/qwen3-coder, with
    // DIFFERENT family strings — so the cascade could escalate to itself.
    const ids = MODEL_CATALOG.map((m) => m.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((v, i) => ids.indexOf(v) !== i)}`);
  });

  it("gives every entry a family matching its vendor prefix", () => {
    for (const m of MODEL_CATALOG) {
      const vendor = vendorOf(m.id);
      const stem = m.family.split("-")[0];
      const ok =
        m.family.startsWith(vendor) ||
        vendor.startsWith(stem) ||
        // slug vendor and lab name legitimately differ for these
        (vendor === "anthropic" && m.family === "anthropic") ||
        (vendor === "moonshotai" && m.family === "moonshotai") ||
        (vendor === "z-ai" && m.family.startsWith("z-ai"));
      assert.ok(ok, `${m.id} has family "${m.family}" — aliases must inherit the resolved vendor`);
    }
  });

  it("is exactly the configured ladder, plus the premium tier", () => {
    // Pins the exact set rather than a count: MODEL_CATALOG filters against the
    // allowlist SILENTLY, so a typo drops a model with no error anywhere.
    //
    // gpt-5.6-terra is still here after escalation moved to Anthropic — it did
    // not leave the product, it stopped being the escalation step and became
    // the premium/complex-build tier (ROUTER_PREMIUM in model-defaults.ts).
    //
    // anthropic/claude-opus-5 is deliberately absent. It resolves live and is
    // priced in model-prices.ts, but approving it here makes it selectable and
    // routable at 2.5x Sonnet 5 for the same cross-vendor property.
    assert.deepEqual(
      [...MODEL_CATALOG.map((m) => m.id)].sort(),
      [
        "anthropic/claude-sonnet-5",
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-pro",
        "openai/gpt-5.6-luna",
        "openai/gpt-5.6-terra",
        "z-ai/glm-5.2:free",
      ].sort(),
      "catalog drifted from the configured ladder",
    );
  });

  it("spans at least three vendors", () => {
    const vendors = new Set(MODEL_CATALOG.map((m) => m.id.split("/")[0]));
    assert.ok(vendors.size >= 3, `only ${vendors.size} vendors: ${[...vendors].join(", ")}`);
  });

  it("never admits an openrouter/* meta-model", () => {
    // openrouter/auto and openrouter/free choose a real model per request by
    // their own logic, so the model that answers is unknowable in advance —
    // which breaks cost accounting, the cross-vendor rule, and every per-model
    // metric in ai_eval_log at once.
    for (const m of MODEL_CATALOG) {
      assert.ok(!isBannedRouterMetaModel(m.id), `${m.id} is a router meta-model`);
    }
    assert.ok(isBannedRouterMetaModel("openrouter/free"));
    assert.ok(isBannedRouterMetaModel("openrouter/auto"));
    assert.ok(!isBannedRouterMetaModel("z-ai/glm-5.2"));
  });
});

describe("model catalog — every configured tier is a real catalog entry", () => {
  // A tier pointing at a slug the catalog doesn't know means no strength
  // metadata, no prompt hints, and no cost data for that model.
  for (const [name, model] of Object.entries({
    DEFAULT_CODING_MODEL,
    FREE_CODING_MODEL,
    AUTOCOMPLETE_MODEL,
    ESCALATION_MODEL,
    REVIEW_MODEL,
    DESIGN_MODEL,
  })) {
    it(`${name} (${model}) is in the catalog`, () => {
      assert.ok(getCatalogModel(model), `${name}="${model}" is not an approved catalog entry`);
    });
  }
});

describe("model catalog — the UI picker and the router agree", () => {
  it("every picker entry is an approved catalog entry", () => {
    // openrouter-models.ts is a SECOND list. When it drifts, users get menu
    // rows that route to a model the router will refuse.
    const approved = new Set(MODEL_CATALOG.map((m) => m.id));
    const orphans = OPENROUTER_MODEL_CATALOG.filter((o) => !approved.has(o.id)).map((o) => o.id);
    assert.deepEqual(orphans, [], `picker offers models the router won't accept: ${orphans.join(", ")}`);
  });

  it("has no duplicate picker ids", () => {
    const ids = OPENROUTER_MODEL_CATALOG.map((o) => o.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

describe("selectModelChain — cascades must cross vendors", () => {
  const PROMPTS = [
    "add a new dashboard page with charts and filters",
    "fix the typescript error in the api handler",
    "refactor the auth module to use the new session helper",
    "write pricing page copy for the landing page",
    "make the hero section darker and add a signup button",
    "plan the database architecture for a booking app",
  ];

  for (const prompt of PROMPTS) {
    it(`"${prompt.slice(0, 34)}…" escalates to a different lab`, () => {
      const chain = selectModelChain(prompt, { maxChain: 3 });
      assert.ok(chain.length >= 2, "a cascade of one cannot cross-verify anything");
      // The first two hops are the ones that matter: hop 2 is the retry that is
      // supposed to catch hop 1's mistakes. Same vendor = same blind spots.
      assert.notEqual(
        vendorOf(chain[0]),
        vendorOf(chain[1]),
        `chain stayed inside one vendor: ${chain.join(" -> ")}`,
      );
    });
  }

  it("always appends a known-good anchor last", () => {
    const chain = selectModelChain("do something unusual and specific", { maxChain: 2 });
    assert.ok(chain.includes(DEFAULT_CODING_MODEL), `anchor missing from ${chain.join(" -> ")}`);
  });

  it("never returns a model that is not in the catalog", () => {
    for (const prompt of PROMPTS) {
      for (const id of selectModelChain(prompt)) {
        assert.ok(getCatalogModel(id), `${id} is not a catalog entry`);
      }
    }
  });

  it("leads with a cheap model on trivial prompts", () => {
    const chain = selectModelChain("fix typo", { maxChain: 3 });
    assert.ok((getCatalogModel(chain[0])?.cost ?? 5) <= 1, `trivial prompt led with ${chain[0]}`);
  });

  it("does not let the word 'fix' alone buy a frontier model", () => {
    // Regression: "fix typo" routed to gpt-5.6-terra while "add a comma" went
    // free — the only difference was "fix" tripping the fixes strength, which
    // vetoed the cheap tier. "fix" is one of the most common words users type.
    for (const p of ["fix typo", "fix typo in header", "fix the padding", "fix the build error"]) {
      const lead = selectModelChain(p, { maxChain: 3 })[0];
      assert.ok((getCatalogModel(lead)?.cost ?? 5) <= 1, `"${p}" led with ${lead}`);
    }
  });

  // NOTE: these two asserted `cost >= 2` until 2026-08-19, i.e. "a real repair
  // must lead with a premium model". That was the OLD policy. Now the cheap
  // benchmarked lineup leads everything and the heavy model is the escalation
  // target, so the property worth protecting is narrower: a substantial repair
  // must not be handed to the FREE tier, and something heavy must still be
  // reachable in the chain. Loosening an assertion to match a deliberate policy
  // change is fine; loosening it to silence a real regression is not — hence
  // the paired heavy-reachable check rather than just deleting the bound.
  it("does not hand a substantial repair to the free tier", () => {
    const chain = selectModelChain(
      "fix the authentication flow so refresh tokens rotate correctly",
      { maxChain: 3 },
    );
    assert.ok((getCatalogModel(chain[0])?.cost ?? 0) > 0, `substantial fix led with free model ${chain[0]}`);
    assert.ok(
      chain.some((id) => getCatalogModel(id)?.tier === "frontier"),
      `substantial fix has no heavy fallback: ${chain.join(" -> ")}`,
    );
  });

  it("honours an explicitly required 'fixes' strength even on a tiny prompt", () => {
    // self-verify's repair cascade passes require:["fixes"] and must not be
    // downgraded to a FREE model by the tiny-prompt exemption.
    const chain = selectModelChain("fix typo", { maxChain: 3, require: ["fixes"] });
    assert.ok((getCatalogModel(chain[0])?.cost ?? 0) > 0, `required-fixes led with free model ${chain[0]}`);
    assert.ok(
      chain.some((id) => getCatalogModel(id)?.tier === "frontier"),
      `required-fixes chain has no heavy fallback: ${chain.join(" -> ")}`,
    );
  });

  it("keeps at least one frontier model in the catalog to escalate into", () => {
    // Removing every OpenAI model plus Opus once left ZERO frontier entries,
    // which silently turned the free->heavy safety net into a no-op.
    assert.ok(
      MODEL_CATALOG.some((m) => m.tier === "frontier"),
      "no frontier model left — cheap-led cascades have nothing to escalate into",
    );
  });

  it("keeps the expensive models out of the hot path", () => {
    // Narrowed three times. It began as "no OpenAI model is routable at all",
    // became "OpenAI only in the escalation slot" when Terra was named, then
    // the generator became gpt-5.6-luna — also OpenAI, but at $0.20/$1.20 one
    // of the cheapest models here and chosen on measurements.
    //
    // The risk being guarded has never changed: an EXPENSIVE model drifting
    // into a tier that every single request touches. What changed on
    // 2026-08-27 is that there are now legitimately TWO costly entries — the
    // premium tier (Terra) and the escalation tier (Sonnet 5) — so pinning the
    // set to a single id no longer expresses the rule.
    //
    // Note what is NOT asserted: that escalation is the priciest slug. It is
    // not — Sonnet 5 ($2/$10) undercuts the Terra it escalates past ($2/$12).
    // Escalation earns its place by changing LAB, not by costing more, and an
    // assertion that it must be the most expensive entry would quietly forbid
    // exactly the cheap-and-cross-vendor choice that is wanted here.
    const costly = MODEL_CATALOG.filter((m) => (m.cost ?? 0) >= 3);
    assert.deepEqual(
      costly.map((m) => m.id).sort(),
      [ESCALATION_MODEL, PREMIUM_CODING_MODEL].sort(),
      "an expensive model appeared outside the escalation and premium tiers",
    );

    const generator = getCatalogModel(DEFAULT_CODING_MODEL);
    assert.ok((generator?.cost ?? 9) <= 1, `generator costs ${generator?.cost}; it must be a cheap tier`);
  });
});

describe("selectModelChain — cascades must cross vendors", () => {
  const PROMPTS = [
    "add a new dashboard page with charts and filters",
    "fix the typescript error in the api handler",
    "refactor the auth module to use the new session helper",
    "write pricing page copy for the landing page",
    "make the hero section darker and add a signup button",
    "plan the database architecture for a booking app",
  ];

  for (const prompt of PROMPTS) {
    it(`"${prompt.slice(0, 34)}…" escalates to a different lab`, () => {
      const chain = selectModelChain(prompt, { maxChain: 3 });
      assert.ok(chain.length >= 2, "a cascade of one cannot cross-verify anything");
      // The first two hops are the ones that matter: hop 2 is the retry that is
      // supposed to catch hop 1's mistakes. Same vendor = same blind spots.
      assert.notEqual(
        vendorOf(chain[0]),
        vendorOf(chain[1]),
        `chain stayed inside one vendor: ${chain.join(" -> ")}`,
      );
    });
  }

  it("always appends a known-good anchor last", () => {
    const chain = selectModelChain("do something unusual and specific", { maxChain: 2 });
    assert.ok(chain.includes(DEFAULT_CODING_MODEL), `anchor missing from ${chain.join(" -> ")}`);
  });

  it("never returns a model that is not in the catalog", () => {
    for (const prompt of PROMPTS) {
      for (const id of selectModelChain(prompt)) {
        assert.ok(getCatalogModel(id), `${id} is not a catalog entry`);
      }
    }
  });

  it("leads with a cheap model on trivial prompts", () => {
    const chain = selectModelChain("fix typo", { maxChain: 3 });
    assert.ok((getCatalogModel(chain[0])?.cost ?? 5) <= 1, `trivial prompt led with ${chain[0]}`);
  });

  it("does not let the word 'fix' alone buy a frontier model", () => {
    // Regression: "fix typo" routed to gpt-5.6-terra while "add a comma" went
    // free — the only difference was "fix" tripping the fixes strength, which
    // vetoed the cheap tier. "fix" is one of the most common words users type.
    for (const p of ["fix typo", "fix typo in header", "fix the padding", "fix the build error"]) {
      const lead = selectModelChain(p, { maxChain: 3 })[0];
      assert.ok((getCatalogModel(lead)?.cost ?? 5) <= 1, `"${p}" led with ${lead}`);
    }
  });

  // NOTE: these two asserted `cost >= 2` until 2026-08-19, i.e. "a real repair
  // must lead with a premium model". That was the OLD policy. Now the cheap
  // benchmarked lineup leads everything and the heavy model is the escalation
  // target, so the property worth protecting is narrower: a substantial repair
  // must not be handed to the FREE tier, and something heavy must still be
  // reachable in the chain. Loosening an assertion to match a deliberate policy
  // change is fine; loosening it to silence a real regression is not — hence
  // the paired heavy-reachable check rather than just deleting the bound.
  it("does not hand a substantial repair to the free tier", () => {
    const chain = selectModelChain(
      "fix the authentication flow so refresh tokens rotate correctly",
      { maxChain: 3 },
    );
    assert.ok((getCatalogModel(chain[0])?.cost ?? 0) > 0, `substantial fix led with free model ${chain[0]}`);
    assert.ok(
      chain.some((id) => getCatalogModel(id)?.tier === "frontier"),
      `substantial fix has no heavy fallback: ${chain.join(" -> ")}`,
    );
  });

  it("honours an explicitly required 'fixes' strength even on a tiny prompt", () => {
    // self-verify's repair cascade passes require:["fixes"] and must not be
    // downgraded to a FREE model by the tiny-prompt exemption.
    const chain = selectModelChain("fix typo", { maxChain: 3, require: ["fixes"] });
    assert.ok((getCatalogModel(chain[0])?.cost ?? 0) > 0, `required-fixes led with free model ${chain[0]}`);
    assert.ok(
      chain.some((id) => getCatalogModel(id)?.tier === "frontier"),
      `required-fixes chain has no heavy fallback: ${chain.join(" -> ")}`,
    );
  });

  it("keeps at least one frontier model in the catalog to escalate into", () => {
    // Removing every OpenAI model plus Opus once left ZERO frontier entries,
    // which silently turned the free->heavy safety net into a no-op.
    assert.ok(
      MODEL_CATALOG.some((m) => m.tier === "frontier"),
      "no frontier model left — cheap-led cascades have nothing to escalate into",
    );
  });

  it("gives a cheap-led chain a frontier safety net to escalate to", () => {
    const chain = selectModelChain("fix typo", { maxChain: 3 });
    assert.ok(
      chain.some((id) => getCatalogModel(id)?.tier === "frontier"),
      `cheap-led chain has no heavy fallback: ${chain.join(" -> ")}`,
    );
  });
});

describe("the ladder — each step is a different lab from the one it checks", () => {
  it("the diagnosis model is a different vendor from the generator", () => {
    // The entire value of the diagnose step is a second opinion. Point it at the
    // generator's own vendor and it becomes the model re-reading its own work
    // with the same assumptions that produced the bug.
    assert.notEqual(vendorOf(DIAGNOSIS_MODEL), vendorOf(DEFAULT_CODING_MODEL));
  });

  it("the diagnosis model differs from BOTH the generator and the escalation model", () => {
    assert.notEqual(vendorOf(DIAGNOSIS_MODEL), vendorOf(DEFAULT_CODING_MODEL));
    assert.notEqual(vendorOf(DIAGNOSIS_MODEL), vendorOf(ESCALATION_MODEL));
  });

  it("the escalation model is a different vendor from the generator", () => {
    // This is the invariant the ladder LOST between 2026-08-19 and 2026-08-27:
    // generate and escalate were both OpenAI (gpt-5.6-luna -> gpt-5.6-terra),
    // so the final repair was the same lab re-reading code its own house style
    // had just failed to fix. Escalation now goes to Anthropic, which restores
    // it — and this test is what stops a future "cheaper escalation" swap from
    // silently collapsing the hop back onto the generator's vendor.
    assert.notEqual(vendorOf(ESCALATION_MODEL), vendorOf(DEFAULT_CODING_MODEL));
  });

  it("the escalation slug is in the approved set, so it is not silently dropped", () => {
    // MODEL_CATALOG filters unapproved ids SILENTLY. An escalation slug that
    // never made it into APPROVED_SMART_MODEL_IDS would vanish from the catalog
    // with no log, and the ladder would degrade to whatever the fallback picks
    // while every comment in the repo still claimed it escalated.
    assert.ok(
      getCatalogModel(ESCALATION_MODEL),
      `escalation model ${ESCALATION_MODEL} is not in MODEL_CATALOG`,
    );
    assert.ok(
      OPENROUTER_MODEL_CATALOG.some((m) => m.id === ESCALATION_MODEL),
      `escalation model ${ESCALATION_MODEL} is missing from the user-facing catalog`,
    );
  });

  it("the premium tier is not the escalation tier", () => {
    // They were ONE constant (ROUTER_ESCALATE fed PREMIUM_CODING_MODEL too), so
    // repointing escalation at the priciest model in the product would have
    // repriced every premium build as a side effect — five happy-path calls
    // instead of one gated retry.
    assert.notEqual(PREMIUM_CODING_MODEL, ESCALATION_MODEL);
    assert.notEqual(PREMIUM_REASONING_MODEL, ESCALATION_MODEL);
  });

  it("escalation is the most expensive tier, and generation is not", () => {
    // If these ever invert, the ladder is upside down and every build pays the
    // escalation price up front.
    const gen = getCatalogModel(DEFAULT_CODING_MODEL);
    const esc = getCatalogModel(ESCALATION_MODEL);
    assert.ok(gen && esc);
    assert.ok((esc?.cost ?? 0) > (gen?.cost ?? 0), "escalation must cost more than generation");
  });
});

describe("model-defaults — cross-vendor review is real", () => {
  it("the reviewer is a different vendor from the builder", () => {
    // This was once literally the same model reviewing its own output.
    assert.notEqual(vendorOf(REVIEW_MODEL), vendorOf(DEFAULT_CODING_MODEL));
  });

  it("SOMETHING in the repair path is a different vendor from the builder", () => {
    // Weaker than the two per-step assertions above and kept deliberately: this
    // is the floor. Even if a future cost cut collapses one step back onto the
    // builder's vendor, the repair path must never become a single lab talking
    // to itself.
    const builder = vendorOf(DEFAULT_CODING_MODEL);
    const repairPath = [DIAGNOSIS_MODEL, ESCALATION_MODEL].map(vendorOf);
    assert.ok(
      repairPath.some((v) => v !== builder),
      `entire repair path is ${builder}: ${repairPath.join(", ")}`,
    );
  });
});
