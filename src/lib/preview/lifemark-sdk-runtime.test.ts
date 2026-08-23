/**
 * RUNTIME smoke test for the injected LifemarkData SDK. The SDK is ES5 code
 * inside a template string - string assertions can't prove it executes. This
 * evals the real script with stubbed browser APIs and drives the whole
 * surface: schemas, coercion, defaults, uniqueness, seeding, filtered lists,
 * in BOTH localStorage mode and hosted (fetch) mode.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { lifemarkDataSdkScript } from "./lifemark-data.ts";

type AnyRecord = Record<string, unknown>;

interface SdkGlobal {
  hosted: boolean;
  defineSchema(c: string, fields: AnyRecord): Promise<void>;
  getSchema(c: string): Promise<AnyRecord | null>;
  list(c: string, o?: AnyRecord): Promise<Array<{ id: string; data: AnyRecord }>>;
  seed(c: string, rows: AnyRecord[]): Promise<{ seeded: number }>;
  create(c: string, d: AnyRecord): Promise<{ id: string; data: AnyRecord }>;
  update(c: string, id: string, d: AnyRecord): Promise<{ id: string; data: AnyRecord }>;
  remove(c: string, id: string): Promise<{ ok: boolean }>;
}

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

/** Eval the SDK script and return the LifemarkData global it installs. */
function bootSdk(opts: { slug?: string; apiBase?: string; fetch?: typeof fetch }): SdkGlobal {
  const script = lifemarkDataSdkScript({ slug: opts.slug ?? null, apiBase: opts.apiBase ?? null });
  const js = script.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  const windowObj: AnyRecord = {};
  const fn = new Function("window", "localStorage", "crypto", "fetch", js);
  fn(windowObj, makeLocalStorage(), { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` }, opts.fetch);
  return windowObj.LifemarkData as SdkGlobal;
}

// ── Local (preview) mode ─────────────────────────────────────────────────────

let sdk: SdkGlobal;
beforeEach(() => {
  sdk = bootSdk({});
});

test("local mode: create/list/update/remove round-trip", async () => {
  assert.equal(sdk.hosted, false);
  const rec = await sdk.create("notes", { text: "hi" });
  assert.ok(rec.id);
  assert.equal((await sdk.list("notes")).length, 1);
  await sdk.update("notes", rec.id, { text: "edited" });
  assert.equal((await sdk.list("notes"))[0].data.text, "edited");
  await sdk.remove("notes", rec.id);
  assert.equal((await sdk.list("notes")).length, 0);
});

test("local mode: schema validation rejects unknown fields and bad types", async () => {
  await sdk.defineSchema("customers", {
    name: { type: "string", required: true },
    ltv: { type: "number" },
  });
  await assert.rejects(
    () => sdk.create("customers", { fullName: "Ali" }),
    /Missing required field "name"|Unknown field "fullName"/,
  );
  await assert.rejects(
    () => sdk.create("customers", { name: "Ali", ltv: "abc" }),
    /must be of type number/,
  );
});

test("local mode: coercion, defaults, min/max, enum", async () => {
  await sdk.defineSchema("orders", {
    qty: { type: "number", min: 1, max: 99 },
    status: { type: "string", enum: ["new", "done"], default: "new" },
    rush: { type: "boolean" },
  });
  const rec = await sdk.create("orders", { qty: "42", rush: "true" });
  assert.equal(rec.data.qty, 42);
  assert.equal(rec.data.rush, true);
  assert.equal(rec.data.status, "new");
  await assert.rejects(() => sdk.create("orders", { qty: 0 }), /must be >= 1/);
  await assert.rejects(() => sdk.create("orders", { status: "maybe" }), /must be one of/);
});

test("local mode: unique enforcement, including on update", async () => {
  await sdk.defineSchema("users", { email: { type: "string", unique: true } });
  const a = await sdk.create("users", { email: "a@x.com" });
  await sdk.create("users", { email: "b@x.com" });
  await assert.rejects(() => sdk.create("users", { email: "a@x.com" }), /must be unique/);
  await sdk.update("users", a.id, { email: "a@x.com" });
  await assert.rejects(() => sdk.update("users", a.id, { email: "b@x.com" }), /must be unique/);
});

test("local mode: seed is idempotent and validated", async () => {
  await sdk.defineSchema("items", { sku: { type: "string", required: true } });
  const first = await sdk.seed("items", [{ sku: "A" }, { sku: "B" }]);
  assert.equal(first.seeded, 2);
  const second = await sdk.seed("items", [{ sku: "C" }]);
  assert.equal(second.seeded, 0);
  assert.equal((await sdk.list("items")).length, 2);
  await assert.rejects(() => sdk.seed("items2", [{ sku: 1 }]).then(async () => {
    await sdk.defineSchema("items3", { sku: { type: "string", required: true } });
    return sdk.seed("items3", [{ nope: "x" }]);
  }), /Missing required field|Unknown field/);
  const free = await sdk.seed("scratch", [{ anything: true }]);
  assert.equal(free.seeded, 1);
});

test("local mode: list where/limit filtering", async () => {
  await sdk.create("deals", { stage: "won", amount: 10 });
  await sdk.create("deals", { stage: "lost", amount: 5 });
  await sdk.create("deals", { stage: "won", amount: 7 });
  const won = await sdk.list("deals", { where: { stage: "won" } });
  assert.equal(won.length, 2);
  const capped = await sdk.list("deals", { limit: 1 });
  assert.equal(capped.length, 1);
});

test("local mode: getSchema returns the declared schema", async () => {
  await sdk.defineSchema("tags", { label: { type: "string" } });
  const s = await sdk.getSchema("tags");
  assert.ok(s && (s as { fields: AnyRecord }).fields.label);
  assert.equal(await sdk.getSchema("nope"), null);
});

// ── Hosted mode (fetch-backed) ───────────────────────────────────────────────

test("hosted mode: calls the right endpoints with the right payloads", async () => {
  const calls: Array<{ url: string; method: string; body: AnyRecord | null }> = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(String(init.body)) as AnyRecord) : null;
    calls.push({ url: String(url), method: init?.method ?? "GET", body });
    const payload =
      String(url).includes("collection=__schema__")
        ? { records: [{ data: { collection: "remote", fields: { x: { type: "number" } } } }] }
        : { records: [], record: { id: "srv-1", data: body?.data ?? {} }, seeded: 3, ok: true };
    return { ok: true, json: async () => payload } as Response;
  }) as unknown as typeof fetch;

  const hosted = bootSdk({ slug: "demo", apiBase: "https://lifemarkai.com", fetch: fakeFetch });
  assert.equal(hosted.hosted, true);

  await hosted.defineSchema("customers", { name: { type: "string", required: true } });
  assert.deepEqual(calls[0].body?.schema, { fields: { name: { type: "string", required: true } } });

  const rec = await hosted.create("customers", { name: "Ali" });
  assert.equal(rec.id, "srv-1");
  assert.equal(calls[1].method, "POST");
  assert.deepEqual(calls[1].body?.data, { name: "Ali" });

  await hosted.update("customers", "srv-1", { name: "Vali" });
  assert.equal(calls[2].method, "PATCH");
  assert.equal(calls[2].body?.collection, "customers");

  const seeded = await hosted.seed("customers", [{ name: "A" }, { name: "B" }, { name: "C" }]);
  assert.equal(seeded.seeded, 3);
  assert.equal((calls[3].body?.seed as AnyRecord[]).length, 3);

  await hosted.list("customers", { where: { name: "Ali" }, limit: 5 });
  assert.ok(calls[4].url.includes("where=name%3AAli"));
  assert.ok(calls[4].url.includes("limit=5"));

  const before = calls.length;
  await assert.rejects(() => hosted.create("customers", { nope: 1 }), /Unknown field/);
  assert.equal(calls.length, before);

  const remote = await hosted.getSchema("remote");
  assert.ok(remote && (remote as { fields: AnyRecord }).fields.x);
});

test("hosted mode: server error surfaces as a thrown message", async () => {
  const failFetch = (async () =>
    ({ ok: false, status: 422, json: async () => ({ error: "Schema validation failed (x): boom" }) }) as Response
  ) as unknown as typeof fetch;
  const hosted = bootSdk({ slug: "demo", apiBase: "https://lifemarkai.com", fetch: failFetch });
  await assert.rejects(() => hosted.create("x", { a: 1 }), /Schema validation failed/);
});
