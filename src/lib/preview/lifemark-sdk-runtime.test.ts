/**
 * RUNTIME smoke test for the injected LifemarkData SDK. The SDK is ES5 code
 * inside a template string — string assertions can't prove it executes. This
 * evals the real script with stubbed browser APIs and drives the whole
 * surface: schemas, coercion, defaults, uniqueness, seeding, filtered lists,
 * in BOTH localStorage mode and hosted (fetch) mode.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { injectLifemarkDataSdk, lifemarkDataSdkRev, lifemarkDataSdkScript } from "./lifemark-data";

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

/**
 * A localStorage that THROWS on every access — exactly what a sandboxed srcdoc
 * iframe without allow-same-origin hands the page (opaque origin).
 */
function makeOpaqueOriginStorage() {
  const boom = () => {
    throw new DOMException("The operation is insecure.", "SecurityError");
  };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

/** Eval the SDK script and return the LifemarkData global it installs. */
function bootSdk(opts: {
  slug?: string;
  apiBase?: string;
  fetch?: typeof fetch;
  storage?: unknown;
}): SdkGlobal {
  const script = lifemarkDataSdkScript({ slug: opts.slug ?? null, apiBase: opts.apiBase ?? null });
  const js = script.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
  const windowObj: AnyRecord = {};
  const fn = new Function("window", "localStorage", "crypto", "fetch", js);
  fn(windowObj, opts.storage ?? makeLocalStorage(), { randomUUID: () => `id-${Math.random().toString(36).slice(2)}` }, opts.fetch);
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
  // updating a record to ITS OWN value is allowed
  await sdk.update("users", a.id, { email: "a@x.com" });
  // updating to someone else's value is not
  await assert.rejects(() => sdk.update("users", a.id, { email: "b@x.com" }), /must be unique/);
});

test("local mode: seed is idempotent and validated", async () => {
  await sdk.defineSchema("items", { sku: { type: "string", required: true } });
  const first = await sdk.seed("items", [{ sku: "A" }, { sku: "B" }]);
  assert.equal(first.seeded, 2);
  const second = await sdk.seed("items", [{ sku: "C" }]);
  assert.equal(second.seeded, 0);
  assert.equal((await sdk.list("items")).length, 2);
  // seed rows are schema-validated when a schema exists…
  await assert.rejects(() => sdk.seed("items2", [{ sku: 1 }]).then(async () => {
    await sdk.defineSchema("items3", { sku: { type: "string", required: true } });
    return sdk.seed("items3", [{ nope: "x" }]);
  }), /Missing required field|Unknown field/);
  // …but a schemaless collection seeds freely (validation is opt-in by design)
  const free = await sdk.seed("scratch", [{ anything: true }]);
  assert.equal(free.seeded, 1);
});

test("local mode: re-seeding a collection with a unique field is a no-op, not a throw", async () => {
  // Regression: seed() validated every row BEFORE the "already seeded" check,
  // and prep()'s unique check compares against rows already in the collection —
  // so the second boot of any app that seeds a unique field threw
  // 'must be unique — "…" is already taken' against its OWN seed row.
  // Generated apps call defineSchema + seed unconditionally on startup (exactly
  // as the SDK docs instruct), so this white-screened them on every reload while
  // a fresh store rendered fine.
  await sdk.defineSchema("settings", {
    key: { type: "string", required: true, unique: true },
    value: { type: "string" },
  });
  const rows = [
    { key: "appearance", value: "dark" },
    { key: "locale", value: "en" },
  ];
  const first = await sdk.seed("settings", rows);
  assert.equal(first.seeded, 2);

  // Same call the app makes on its next boot — must be a silent no-op.
  const second = await sdk.seed("settings", rows);
  assert.equal(second.seeded, 0);
  assert.equal((await sdk.list("settings")).length, 2);

  // The unique constraint itself must still be enforced for real writes.
  await assert.rejects(
    () => sdk.create("settings", { key: "appearance", value: "light" }),
    /must be unique/,
  );
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
  assert.equal(calls[2].body?.collection, "customers"); // server-side validation needs it

  const seeded = await hosted.seed("customers", [{ name: "A" }, { name: "B" }, { name: "C" }]);
  assert.equal(seeded.seeded, 3);
  assert.equal((calls[3].body?.seed as AnyRecord[]).length, 3);

  await hosted.list("customers", { where: { name: "Ali" }, limit: 5 });
  assert.ok(calls[4].url.includes("where=name%3AAli"));
  assert.ok(calls[4].url.includes("limit=5"));

  // client-side validation fires BEFORE any network call in hosted mode too
  const before = calls.length;
  await assert.rejects(() => hosted.create("customers", { nope: 1 }), /Unknown field/);
  assert.equal(calls.length, before);

  // remote schema lookup through getSchema
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

// ── SDK injection / propagation ──────────────────────────────────────────────

test("injection: stamps a revision and is a true no-op for the same revision", () => {
  const html = "<html><head></head><body>hi</body></html>";
  const once = injectLifemarkDataSdk(html);
  assert.ok(once.includes(`data-lifemark-data-sdk="${lifemarkDataSdkRev()}"`));
  // Byte-identical on re-injection: the sandbox content-hashes files, so any
  // gratuitous change here would cause a pointless re-push of every index.html.
  assert.equal(injectLifemarkDataSdk(once), once);
});

test("injection: an OLDER baked-in SDK is replaced, not left in place", () => {
  // Regression: the old guard bailed on the mere presence of the marker, so an
  // app kept whatever SDK was injected when its index.html was last rewritten
  // and SDK fixes never reached it. Both the legacy attribute-less marker and a
  // stale revision stamp must be upgraded.
  for (const stale of [
    `<script data-lifemark-data-sdk>(function(){/* ancient */})();</script>`,
    `<script data-lifemark-data-sdk="deadbeef">(function(){/* stale */})();</script>`,
  ]) {
    const html = `<html><head>${stale}</head><body>hi</body></html>`;
    const out = injectLifemarkDataSdk(html);
    assert.ok(!out.includes("ancient") && !out.includes("stale"), "old SDK body must be gone");
    assert.ok(out.includes(`data-lifemark-data-sdk="${lifemarkDataSdkRev()}"`));
    // Exactly one SDK block survives — no duplicate registration of window.LifemarkData.
    assert.equal(out.match(/data-lifemark-data-sdk/g)?.length, 1);
    // The replacement carries the REAL SDK, and the rest of the page is intact.
    assert.ok(out.includes("window.LifemarkData"));
    assert.ok(out.includes("<body>hi</body>"));
  }
});

test("injection: the revision actually tracks the SDK source", () => {
  // A fingerprint that ignored the body would defeat the whole mechanism.
  assert.match(lifemarkDataSdkRev(), /^[a-z0-9]+$/);
  // Endpoint differences must NOT change the revision, or every published app
  // would churn its index.html on each push purely because its slug differs.
  const local = lifemarkDataSdkScript({});
  const hosted = lifemarkDataSdkScript({ slug: "demo", apiBase: "https://lifemarkai.com" });
  const rev = (s: string) => s.match(/data-lifemark-data-sdk="([^"]+)"/)?.[1];
  assert.equal(rev(local), rev(hosted));
  assert.notEqual(local, hosted);
});

// ── Opaque origin (sandboxed srcdoc, no allow-same-origin) ───────────────────

test("opaque origin: the SDK stays fully usable when localStorage throws", async () => {
  // Regression: every localStorage access was individually try/caught, so a
  // throwing store was swallowed on write and became [] on read. An app would
  // seed "successfully" into nothing and render permanently empty with no error
  // anywhere — precisely how the editor's static preview behaved while the same
  // app on its preview subdomain (a real origin) showed a full dataset.
  const opaque = bootSdk({ storage: makeOpaqueOriginStorage() });
  assert.equal(opaque.hosted, false);

  // Schemas survive, so validation still works rather than silently going away.
  await opaque.defineSchema("settings", {
    key: { type: "string", required: true, unique: true },
    value: { type: "string" },
  });
  const s = await opaque.getSchema("settings");
  assert.ok(s && (s as { fields: AnyRecord }).fields.key, "schema must round-trip in memory");

  // Seeded demo data actually renders instead of showing an empty app.
  const seeded = await opaque.seed("settings", [
    { key: "appearance", value: "dark" },
    { key: "locale", value: "en" },
  ]);
  assert.equal(seeded.seeded, 2);
  assert.equal((await opaque.list("settings")).length, 2);

  // Writes stick and read back within the page's lifetime.
  const rec = await opaque.create("settings", { key: "density", value: "compact" });
  assert.equal((await opaque.list("settings")).length, 3);
  await opaque.update("settings", rec.id, { key: "density", value: "cosy" });
  assert.equal(
    (await opaque.list("settings", { where: { key: "density" } }))[0].data.value,
    "cosy",
  );
  await opaque.remove("settings", rec.id);
  assert.equal((await opaque.list("settings")).length, 2);

  // Constraints are still enforced — the fallback is a real store, not a stub.
  await assert.rejects(
    () => opaque.create("settings", { key: "appearance" }),
    /must be unique/,
  );
  // …and re-seeding is still the documented no-op.
  assert.equal((await opaque.seed("settings", [{ key: "appearance", value: "dark" }])).seeded, 0);
});

test("opaque origin: memory is per-page, and real origins still use localStorage", async () => {
  // Two opaque pages must not share state — MEM is scoped to one SDK instance,
  // mirroring the fact that nothing CAN persist on an opaque origin.
  const pageA = bootSdk({ storage: makeOpaqueOriginStorage() });
  await pageA.create("notes", { text: "a" });
  const pageB = bootSdk({ storage: makeOpaqueOriginStorage() });
  assert.equal((await pageB.list("notes")).length, 0, "a fresh page starts empty");

  // A working store is still written through, so real origins keep persisting.
  const store = makeLocalStorage();
  const real = bootSdk({ storage: store });
  await real.create("notes", { text: "persisted" });
  assert.equal(store.getItem("lifemarkdata:notes") !== null, true, "must hit localStorage");
});
