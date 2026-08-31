import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { fireProjectWebhookEvent, type WebhookEndpoint } from "./dispatch.ts";

/**
 * Minimal fake Supabase client: one project row whose `metadata.webhooks`
 * mutates in place across the read (in fireProjectWebhookEvent) and the
 * write it does afterward to record lastStatus/lastFiredAt.
 */
function fakeSupabase(webhooks: WebhookEndpoint[]) {
  const state = { metadata: { webhooks } as Record<string, unknown> };
  let lastUpdate: Record<string, unknown> | null = null;
  return {
    client: {
      from(table: string) {
        assert.equal(table, "projects");
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          single: async () => ({ data: { metadata: state.metadata } }),
          update(payload: Record<string, unknown>) {
            lastUpdate = payload;
            const meta = payload.metadata as Record<string, unknown>;
            state.metadata = meta;
            return { eq: async () => ({ error: null }) };
          },
        };
      },
    },
    getLastUpdate: () => lastUpdate,
    getMetadata: () => state.metadata,
  };
}

test("fires only endpoints subscribed to the event, signed with the endpoint's own secret", async () => {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: init.body as string });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    // IP-literal hosts, not symbolic hostnames: fireProjectWebhookEvent now
    // re-validates each endpoint's URL immediately before delivery (SSRF
    // guard, see validate-external-url.ts) via a real DNS lookup for any
    // non-IP hostname — a made-up ".example" host would fail to resolve in
    // this sandboxed/offline test run and never reach the fetch stub below.
    // A public IP literal skips DNS entirely (Node resolves it locally) and
    // still exercises the same delivery code path.
    const subscribed: WebhookEndpoint = { id: "a", url: "https://93.184.216.34/a", secret: "sekrit", events: ["deploy_success"] };
    const notSubscribed: WebhookEndpoint = { id: "b", url: "https://93.184.216.34/b", secret: "other", events: ["ai_generation"] };
    const { client, getMetadata } = fakeSupabase([subscribed, notSubscribed]);

    await fireProjectWebhookEvent(client, "proj-1", "deploy_success", { url: "https://app.example" });

    assert.equal(calls.length, 1, "only the subscribed endpoint should be POSTed to");
    assert.equal(calls[0].url, "https://93.184.216.34/a");
    assert.equal(calls[0].headers["X-Lifemark-Event"], "deploy_success");

    const expectedSig = `sha256=${createHmac("sha256", "sekrit").update(calls[0].body).digest("hex")}`;
    assert.equal(calls[0].headers["X-Lifemark-Signature"], expectedSig);

    const payload = JSON.parse(calls[0].body) as { event: string; project_id: string; data: unknown };
    assert.equal(payload.event, "deploy_success");
    assert.equal(payload.project_id, "proj-1");

    const webhooks = (getMetadata().webhooks as WebhookEndpoint[]);
    assert.equal(webhooks.find((w) => w.id === "a")?.lastStatus, "success");
    assert.equal(webhooks.find((w) => w.id === "b")?.lastStatus, undefined, "unfired endpoint is left untouched");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("skips endpoints explicitly disabled", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(url as string);
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const disabled: WebhookEndpoint = {
      id: "a", url: "https://93.184.216.34/a", secret: "s", events: ["deploy_success"], enabled: false,
    };
    const { client } = fakeSupabase([disabled]);
    await fireProjectWebhookEvent(client, "proj-1", "deploy_success", {});
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("never throws when delivery fails — best-effort by design", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network down");
  }) as typeof fetch;

  try {
    const ep: WebhookEndpoint = { id: "a", url: "https://93.184.216.34/a", secret: "s", events: ["ai_generation"] };
    const { client, getMetadata } = fakeSupabase([ep]);
    await fireProjectWebhookEvent(client, "proj-1", "ai_generation", {});
    const webhooks = (getMetadata().webhooks as WebhookEndpoint[]);
    assert.equal(webhooks[0].lastStatus, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no-op (no read/write) when the project has no webhooks configured", async () => {
  const { client, getLastUpdate } = fakeSupabase([]);
  await fireProjectWebhookEvent(client, "proj-1", "deploy_success", {});
  assert.equal(getLastUpdate(), null, "should not write metadata back when there is nothing to fire");
});

test("never delivers to a private/internal target, even if it passed validation at save time", async () => {
  // /api/projects/:id/webhooks validates a URL when it's first saved, but
  // fireProjectWebhookEvent re-validates immediately before every delivery
  // (SSRF / DNS-rebinding guard) — a stored endpoint pointing at a private
  // address must never actually be fetched, no matter how it got saved.
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    calls.push(url as string);
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const metadataEndpoint: WebhookEndpoint = {
      id: "a", url: "http://169.254.169.254/latest/meta-data/", secret: "s", events: ["deploy_success"],
    };
    const { client, getMetadata } = fakeSupabase([metadataEndpoint]);
    await fireProjectWebhookEvent(client, "proj-1", "deploy_success", {});
    assert.equal(calls.length, 0, "the private-address endpoint must never actually be fetched");
    const webhooks = getMetadata().webhooks as WebhookEndpoint[];
    assert.equal(webhooks[0].lastStatus, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
