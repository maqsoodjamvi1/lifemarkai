import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateSchemaDefinition,
  validateRecordAgainstSchema,
  prepareRecordForWrite,
  uniqueFields,
  typesFromSchemas,
  SCHEMA_MAX_FIELDS,
  type LifemarkCollectionSchema,
} from "./lifemark-schema";
import { lifemarkDataSdkScript, LIFEMARK_DATA_PROMPT_BLOCK } from "./lifemark-data";

const customers: LifemarkCollectionSchema = {
  fields: {
    name: { type: "string", required: true },
    email: { type: "string" },
    status: { type: "string", enum: ["lead", "active", "churned"] },
    ltv: { type: "number" },
    tags: { type: "string[]" },
    meta: { type: "object" },
  },
};

// ── Schema definition validation ─────────────────────────────────────────────

test("a well-formed schema definition validates", () => {
  assert.deepEqual(validateSchemaDefinition(customers), []);
});

test("schema without fields is rejected", () => {
  assert.ok(validateSchemaDefinition({}).length > 0);
  assert.ok(validateSchemaDefinition({ fields: {} }).length > 0);
  assert.ok(validateSchemaDefinition(null).length > 0);
  assert.ok(validateSchemaDefinition([1]).length > 0);
});

test("invalid field types and names are rejected", () => {
  const errs = validateSchemaDefinition({
    fields: {
      good: { type: "string" },
      bad: { type: "datetime" },
      "9starts-with-digit": { type: "string" },
    },
  });
  assert.ok(errs.some((e) => e.includes('"bad"')));
  assert.ok(errs.some((e) => e.includes("9starts-with-digit")));
});

test("empty and oversized enums are rejected", () => {
  assert.ok(
    validateSchemaDefinition({ fields: { s: { type: "string", enum: [] } } }).length > 0,
  );
  assert.ok(
    validateSchemaDefinition({ fields: { s: { type: "string", enum: [{}] } } }).length > 0,
  );
});

test("field-count cap is enforced", () => {
  const fields: Record<string, { type: string }> = {};
  for (let i = 0; i <= SCHEMA_MAX_FIELDS; i++) fields[`f${i}`] = { type: "string" };
  assert.ok(validateSchemaDefinition({ fields }).some((e) => e.includes("exceeds")));
});

// ── Record validation ────────────────────────────────────────────────────────

test("a conforming record passes", () => {
  const errs = validateRecordAgainstSchema(
    { name: "Ali", email: "ali@x.com", status: "lead", ltv: 120, tags: ["vip"], meta: { a: 1 } },
    customers,
  );
  assert.deepEqual(errs, []);
});

test("missing required field is caught", () => {
  const errs = validateRecordAgainstSchema({ email: "a@b.c" }, customers);
  assert.ok(errs.some((e) => e.includes('required field "name"')));
});

test("wrong types are caught", () => {
  const errs = validateRecordAgainstSchema(
    { name: "Ali", ltv: "a lot", tags: [1, 2] },
    customers,
  );
  assert.ok(errs.some((e) => e.includes('"ltv" must be of type number')));
  assert.ok(errs.some((e) => e.includes('"tags" must be of type string[]')));
});

test("out-of-enum value is caught", () => {
  const errs = validateRecordAgainstSchema({ name: "Ali", status: "vip" }, customers);
  assert.ok(errs.some((e) => e.includes('"status" must be one of')));
});

test("undeclared field is caught — the typo-catcher", () => {
  const errs = validateRecordAgainstSchema({ name: "Ali", fullName: "Ali K" }, customers);
  assert.ok(errs.some((e) => e.includes('Unknown field "fullName"')));
});

test("optional fields may be omitted or null", () => {
  assert.deepEqual(validateRecordAgainstSchema({ name: "Ali", email: null as unknown as undefined }, customers), []);
});

// ── Defaults, coercion, min/max, unique ─────────────────────────────────────

const strict: LifemarkCollectionSchema = {
  fields: {
    email: { type: "string", required: true, unique: true, min: 5, max: 80 },
    age: { type: "number", min: 0, max: 130 },
    active: { type: "boolean", default: true },
    plan: { type: "string", enum: ["free", "pro"], default: "free" },
  },
};

test("invalid schema options are rejected at definition time", () => {
  assert.ok(
    validateSchemaDefinition({ fields: { a: { type: "string", min: "x" } } }).length > 0,
  );
  assert.ok(
    validateSchemaDefinition({ fields: { a: { type: "number", min: 10, max: 5 } } }).length > 0,
  );
  assert.ok(
    validateSchemaDefinition({ fields: { a: { type: "object", unique: true } } }).length > 0,
  );
  assert.ok(
    validateSchemaDefinition({ fields: { a: { type: "number", default: "nope" } } }).length > 0,
  );
  assert.ok(
    validateSchemaDefinition({
      fields: { a: { type: "string", enum: ["x"], default: "y" } },
    }).length > 0,
  );
});

test("defaults are applied for missing fields", () => {
  const { data, errors } = prepareRecordForWrite({ email: "a@b.com" }, strict);
  assert.deepEqual(errors, []);
  assert.equal(data.active, true);
  assert.equal(data.plan, "free");
});

test("form-style string inputs are coerced to number/boolean", () => {
  const { data, errors } = prepareRecordForWrite(
    { email: "a@b.com", age: "42", active: "false" },
    strict,
  );
  assert.deepEqual(errors, []);
  assert.equal(data.age, 42);
  assert.equal(data.active, false);
});

test("uncoercible strings still fail with a type error", () => {
  const { errors } = prepareRecordForWrite({ email: "a@b.com", age: "abc" }, strict);
  assert.ok(errors.some((e) => e.includes('"age" must be of type number')));
});

test("min/max are enforced as value range for numbers and length for strings", () => {
  const low = prepareRecordForWrite({ email: "a@b.com", age: -1 }, strict);
  assert.ok(low.errors.some((e) => e.includes('"age" must be >= 0')));
  const short = prepareRecordForWrite({ email: "a@b" }, strict);
  assert.ok(short.errors.some((e) => e.includes('"email" length must be >= 5')));
});

test("uniqueFields lists only unique-declared string/number fields", () => {
  assert.deepEqual(uniqueFields(strict), ["email"]);
  assert.deepEqual(uniqueFields(customers), []);
});

// ── Type generation (parity #2) ──────────────────────────────────────────────

test("typesFromSchemas emits interfaces with enums, optionals and globals", () => {
  const dts = typesFromSchemas({ customers, "order-items": { fields: { qty: { type: "number", required: true } } } });
  assert.ok(dts.includes("export interface Customer {"));
  assert.ok(dts.includes('status?: "lead" | "active" | "churned";'));
  assert.ok(dts.includes("name: string;"));
  assert.ok(dts.includes("export interface OrderItem {"));
  assert.ok(dts.includes("qty: number;"));
  assert.ok(dts.includes("interface Window"));
  assert.ok(dts.includes("defineSchema"));
});

// ── SDK script + prompt block wiring ─────────────────────────────────────────

test("injected SDK carries defineSchema and client-side validation", () => {
  const script = lifemarkDataSdkScript({ slug: "demo", apiBase: "https://lifemarkai.com" });
  assert.ok(script.includes("defineSchema"));
  assert.ok(script.includes("schema validation failed"));
  assert.ok(script.includes("Unknown field"));
  // update() must send the collection so the server can validate PATCHes
  assert.ok(script.includes('collection:c'));
  // defaults, coercion, min/max and local-mode uniqueness are mirrored client-side
  assert.ok(script.includes('"default"'));
  assert.ok(script.includes("isFinite(Number(v))"));
  assert.ok(script.includes("must be >="));
  assert.ok(script.includes("must be unique"));
});

test("prompt block teaches the schema-first workflow and the d.ts contract", () => {
  assert.ok(LIFEMARK_DATA_PROMPT_BLOCK.includes("defineSchema"));
  assert.ok(LIFEMARK_DATA_PROMPT_BLOCK.includes("SCHEMA-FIRST"));
  assert.ok(LIFEMARK_DATA_PROMPT_BLOCK.includes("lifemark-data.d.ts"));
});
