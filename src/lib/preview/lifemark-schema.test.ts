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
  const errors = validateSchemaDefinition(customers);
  assert.equal(errors.length, 0);
});

test("SCHEMA_MAX_FIELDS is enforced", () => {
  const fields: LifemarkCollectionSchema["fields"] = {};
  for (let i = 0; i < SCHEMA_MAX_FIELDS + 1; i++) {
    fields[`f${i}`] = { type: "string" };
  }
  const errors = validateSchemaDefinition({ fields });
  assert.ok(errors.length > 0);
});

test("required field missing is caught", () => {
  const errors = validateRecordAgainstSchema({ id: "1", email: "a@b.c" }, customers);
  assert.ok(errors.some((e) => /name/i.test(e)));
});

test("valid record passes", () => {
  const errors = validateRecordAgainstSchema(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
      age: 30,
      active: true,
      tier: "pro",
    },
    customers,
  );
  assert.equal(errors.length, 0);
});

test("out-of-enum value is caught", () => {
  const errors = validateRecordAgainstSchema(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
      tier: "enterprise",
    },
    customers,
  );
  assert.ok(errors.length > 0);
});

test("undeclared field is caught - the typo-catcher", () => {
  const errors = validateRecordAgainstSchema(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
      nam: "typo",
    } as Record<string, unknown>,
    customers,
  );
  assert.ok(errors.some((e) => /unknown field/i.test(e)));
});

test("optional fields may be omitted or null", () => {
  const errors = validateRecordAgainstSchema(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
      age: null,
    },
    customers,
  );
  assert.equal(errors.length, 0);
});

test("invalid schema options are rejected at definition time", () => {
  const errors = validateSchemaDefinition({
    fields: { n: { type: "number", min: 10, max: 5 } },
  });
  assert.ok(errors.length > 0);
});

test("defaults are applied for missing fields", () => {
  const prepared = prepareRecordForWrite(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
    },
    customers,
  );
  assert.equal(prepared.data.active, true);
  assert.equal(prepared.errors.length, 0);
});

test("form-style string inputs are coerced to number/boolean", () => {
  const prepared = prepareRecordForWrite(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
      age: "42",
      active: "true",
    },
    customers,
  );
  assert.equal(prepared.data.age, 42);
  assert.equal(prepared.data.active, true);
  assert.equal(prepared.errors.length, 0);
});

test("uncoercible strings still fail with a type error", () => {
  const errors = validateRecordAgainstSchema(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
      age: "not-a-number",
    },
    customers,
  );
  assert.ok(errors.length > 0);
});

test("min/max are enforced as value range for numbers and length for strings", () => {
  const errors = validateRecordAgainstSchema(
    {
      id: "1",
      name: "Ada",
      email: "ada@ex.com",
      age: 200,
    },
    customers,
  );
  assert.ok(errors.length > 0);
});

test("uniqueFields lists only unique-declared string/number fields", () => {
  const u = uniqueFields(customers);
  assert.ok(u.includes("id"));
  assert.ok(u.includes("email"));
  assert.ok(!u.includes("name"));
});

test("typesFromSchemas emits interfaces with enums, optionals and globals", () => {
  const dts = typesFromSchemas({ customers });
  // interfaceName strips trailing 's' → Customer
  assert.match(dts, /interface Customer\b/);
  assert.match(dts, /tier\?:/);
  assert.match(dts, /LifemarkData/);
});

test("injected SDK carries defineSchema and client-side validation", () => {
  const script = lifemarkDataSdkScript();
  assert.match(script, /defineSchema/);
  assert.match(script, /validate|required/i);
});

test("prompt block teaches the schema-first workflow and the d.ts contract", () => {
  assert.match(LIFEMARK_DATA_PROMPT_BLOCK, /defineSchema/);
  assert.match(LIFEMARK_DATA_PROMPT_BLOCK, /\.d\.ts/);
});

test("SDK script implements seed, getSchema and filtered list", () => {
  const script = lifemarkDataSdkScript();
  assert.match(script, /async seed\s*\(|seed\s*\(c/);
  assert.match(script, /getSchema/);
  assert.match(script, /where/);
});
