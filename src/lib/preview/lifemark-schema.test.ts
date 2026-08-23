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
} from "./lifemark-schema.ts";
import { lifemarkDataSdkScript, LIFEMARK_DATA_PROMPT_BLOCK } from "./lifemark-data.ts";

const customers: LifemarkCollectionSchema = {
  fields: {
    id: { type: "string", unique: true },
    name: { type: "string", required: true },
    email: { type: "string", unique: true },
    age: { type: "number", min: 0, max: 150 },
    active: { type: "boolean", default: true },
    tier: { type: "string", enum: ["free", "pro", "team"] },
  },
};

test("valid schema definition passes", () => {
  const r = validateSchemaDefinition(customers);
  assert.equal(r.ok, true);
});

test("SCHEMA_MAX_FIELDS is enforced", () => {
  const fields: LifemarkCollectionSchema["fields"] = {};
  for (let i = 0; i < SCHEMA_MAX_FIELDS + 1; i++) {
    fields[`f${i}`] = { type: "string" };
  }
  const r = validateSchemaDefinition({ fields });
  assert.equal(r.ok, false);
});

test("required field missing is caught", () => {
  const r = validateRecordAgainstSchema(customers, { id: "1", email: "a@b.c" });
  assert.equal(r.ok, false);
});

test("valid record passes", () => {
  const r = validateRecordAgainstSchema(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
    age: 30,
    active: true,
    tier: "pro",
  });
  assert.equal(r.ok, true);
});

test("out-of-enum value is caught", () => {
  const r = validateRecordAgainstSchema(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
    tier: "enterprise",
  });
  assert.equal(r.ok, false);
});

test("undeclared field is caught - the typo-catcher", () => {
  const r = validateRecordAgainstSchema(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
    nam: "typo",
  } as Record<string, unknown>);
  assert.equal(r.ok, false);
});

test("optional fields may be omitted or null", () => {
  const r = validateRecordAgainstSchema(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
    age: null,
  });
  assert.equal(r.ok, true);
});

test("invalid schema options are rejected at definition time", () => {
  const r = validateSchemaDefinition({
    fields: { n: { type: "number", min: 10, max: 5 } },
  });
  assert.equal(r.ok, false);
});

test("defaults are applied for missing fields", () => {
  const prepared = prepareRecordForWrite(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
  });
  assert.equal(prepared.active, true);
});

test("form-style string inputs are coerced to number/boolean", () => {
  const prepared = prepareRecordForWrite(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
    age: "42",
    active: "true",
  });
  assert.equal(prepared.age, 42);
  assert.equal(prepared.active, true);
});

test("uncoercible strings still fail with a type error", () => {
  const r = validateRecordAgainstSchema(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
    age: "not-a-number",
  });
  assert.equal(r.ok, false);
});

test("min/max are enforced as value range for numbers and length for strings", () => {
  const r = validateRecordAgainstSchema(customers, {
    id: "1",
    name: "Ada",
    email: "ada@ex.com",
    age: 200,
  });
  assert.equal(r.ok, false);
});

test("uniqueFields lists only unique-declared string/number fields", () => {
  const u = uniqueFields(customers);
  assert.ok(u.includes("id"));
  assert.ok(u.includes("email"));
  assert.ok(!u.includes("name"));
});

test("typesFromSchemas emits interfaces with enums, optionals and globals", () => {
  const dts = typesFromSchemas({ customers });
  assert.match(dts, /interface Customers/);
  assert.match(dts, /tier\?:/);
});

test("injected SDK carries defineSchema and client-side validation", () => {
  assert.match(lifemarkDataSdkScript, /defineSchema/);
  assert.match(lifemarkDataSdkScript, /validate/);
});

test("prompt block teaches the schema-first workflow and the d.ts contract", () => {
  assert.match(LIFEMARK_DATA_PROMPT_BLOCK, /defineSchema/);
  assert.match(LIFEMARK_DATA_PROMPT_BLOCK, /\.d\.ts/);
});

test("SDK script implements seed, getSchema and filtered list", () => {
  assert.match(lifemarkDataSdkScript, /\.seed\s*=/);
  assert.match(lifemarkDataSdkScript, /getSchema/);
  assert.match(lifemarkDataSdkScript, /where/);
});
