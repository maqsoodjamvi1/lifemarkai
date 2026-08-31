import { test } from "node:test";
import assert from "node:assert/strict";

test("isPaddleConfigured is false when PADDLE_API_KEY is unset", async () => {
  delete process.env.PADDLE_API_KEY;
  const { isPaddleConfigured } = await import(`./client.ts?t=${Date.now()}`);
  assert.equal(isPaddleConfigured(), false);
});

test("isPaddleConfigured is true once PADDLE_API_KEY is set", async () => {
  process.env.PADDLE_API_KEY = "pdl_test_key";
  const { isPaddleConfigured } = await import(`./client.ts?t=${Date.now()}`);
  assert.equal(isPaddleConfigured(), true);
  delete process.env.PADDLE_API_KEY;
});

test("getOrCreatePaddleCustomer fails closed with a clear error when Paddle isn't configured, instead of making a network call", async () => {
  delete process.env.PADDLE_API_KEY;
  const { getOrCreatePaddleCustomer } = await import(`./client.ts?t=${Date.now()}`);
  await assert.rejects(
    () => getOrCreatePaddleCustomer("user@example.com"),
    /Paddle is not configured/,
  );
});

test("createPaddleSubscriptionCheckout fails closed the same way", async () => {
  delete process.env.PADDLE_API_KEY;
  const { createPaddleSubscriptionCheckout } = await import(`./client.ts?t=${Date.now()}`);
  await assert.rejects(
    () => createPaddleSubscriptionCheckout({ customerId: "ctm_1", priceId: "pri_1", successUrl: "https://example.com" }),
    /Paddle is not configured/,
  );
});
