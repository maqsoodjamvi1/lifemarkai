import { test } from "node:test";
import assert from "node:assert/strict";

test("getPaddlePriceId returns the monthly/yearly price id from env for a mapped plan", async () => {
  process.env.PADDLE_PRO_MONTHLY_PRICE_ID = "pri_pro_monthly";
  process.env.PADDLE_PRO_YEARLY_PRICE_ID = "pri_pro_yearly";
  // Re-import after setting env — the module reads process.env at load time,
  // same pattern as src/lib/stripe/plans.ts.
  const { getPaddlePriceId } = await import(`./plans.ts?t=${Date.now()}`);
  assert.equal(getPaddlePriceId("pro", "monthly"), "pri_pro_monthly");
  assert.equal(getPaddlePriceId("pro", "yearly"), "pri_pro_yearly");
});

test("getPaddlePriceId returns empty string for a plan with no Paddle mapping (e.g. free, enterprise)", async () => {
  const { getPaddlePriceId } = await import(`./plans.ts?t=${Date.now()}`);
  assert.equal(getPaddlePriceId("free", "monthly"), "");
  assert.equal(getPaddlePriceId("enterprise", "monthly"), "");
});

test("getPlanByPaddlePriceId resolves a configured price id back to the matching Plan", async () => {
  process.env.PADDLE_TEAM_MONTHLY_PRICE_ID = "pri_team_monthly";
  const { getPlanByPaddlePriceId } = await import(`./plans.ts?t=${Date.now()}`);
  const plan = getPlanByPaddlePriceId("pri_team_monthly");
  assert.equal(plan?.id, "team");
});

test("getPlanByPaddlePriceId returns undefined for an unknown price id", async () => {
  const { getPlanByPaddlePriceId } = await import(`./plans.ts?t=${Date.now()}`);
  assert.equal(getPlanByPaddlePriceId("pri_does_not_exist"), undefined);
});
