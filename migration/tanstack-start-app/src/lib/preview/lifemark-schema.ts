/**
 * LifemarkData schemas (Base44 parity #1 + #2) — optional per-collection
 * field schemas, declared by the AI before it writes UI code.
 *
 * Why: without a schema, build N can write {name} and build N+1 can read
 * {fullName}; nothing catches it and the app just shows blanks. With a
 * schema, the bad write is rejected at the API with an error message the
 * AI (and self-healing) can act on.
 *
 * The format is deliberately a MINI schema, not full JSON Schema — small
 * enough to validate identically in the injected browser SDK (ES5) and on
 * the server, and easy for the AI to emit correctly.
 *
 *   { fields: {
 *       name:   { type: "string", required: true },
 *       status: { type: "string", enum: ["new", "won", "lost"] },
 *       amount: { type: "number" },
 *       tags:   { type: "string[]" },
 *       meta:   { type: "object" }          // free-form escape hatch
 *   } }
 *
 * Validation rules (mirrored in lifemarkDataSdkScript for local mode):
 *   - required fields must be present and non-null
 *   - present fields must match their declared type
 *   - enum fields must hold one of the listed values
 *   - unknown top-level fields are REJECTED — this is the typo-catcher
 */

export const SCHEMA_COLLECTION = "__schema__" as const;
export const SCHEMA_MAX_FIELDS = 40;

export type LifemarkFieldType =
  | "string"
  | "number"
  | "boolean"
  | "string[]"
  | "number[]"
  | "object";

export interface LifemarkFieldDef {
  type: LifemarkFieldType;
  required?: boolean;
  enum?: Array<string | number>;
  /** Applied on create/update when the field is missing or null. */
  default?: unknown;
  /** number → minimum value; string/array → minimum length. */
  min?: number;
  /** number → maximum value; string/array → maximum length. */
  max?: number;
  /** string/number only — no two records in the collection may share a value. */
  unique?: boolean;
}

export interface LifemarkCollectionSchema {
  fields: Record<string, LifemarkFieldDef>;
}

const FIELD_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/;
const FIELD_TYPES: LifemarkFieldType[] = [
  "string",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "object",
];

/** Validate a schema DEFINITION. Returns error strings; empty = valid. */
export function validateSchemaDefinition(schema: unknown): string[] {
  const errors: string[] = [];
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return ["Schema must be an object with a fields map"];
  }
  const fields = (schema as { fields?: unknown }).fields;
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
    return ["Schema.fields must be an object of field definitions"];
  }
  const names = Object.keys(fields as Record<string, unknown>);
  if (names.length === 0) errors.push("Schema must declare at least one field");
  if (names.length > SCHEMA_MAX_FIELDS) {
    errors.push(`Schema exceeds ${SCHEMA_MAX_FIELDS} fields`);
  }
  for (const name of names) {
    if (!FIELD_NAME_RE.test(name)) {
      errors.push(`Invalid field name "${name}"`);
      continue;
    }
    const def = (fields as Record<string, unknown>)[name];
    if (typeof def !== "object" || def === null) {
      errors.push(`Field "${name}" must be an object like {type:"string"}`);
      continue;
    }
    const d = def as Partial<LifemarkFieldDef>;
    if (!FIELD_TYPES.includes(d.type as LifemarkFieldType)) {
      errors.push(`Field "${name}" has invalid type "${String(d.type)}"`);
    }
    if (d.required !== undefined && typeof d.required !== "boolean") {
      errors.push(`Field "${name}".required must be a boolean`);
    }
    if (d.enum !== undefined) {
      if (
        !Array.isArray(d.enum) ||
        d.enum.length === 0 ||
        d.enum.length > 100 ||
        !d.enum.every((v) => typeof v === "string" || typeof v === "number")
      ) {
        errors.push(`Field "${name}".enum must be a non-empty array of strings/numbers`);
      }
    }
    if (d.min !== undefined && typeof d.min !== "number") {
      errors.push(`Field "${name}".min must be a number`);
    }
    if (d.max !== undefined && typeof d.max !== "number") {
      errors.push(`Field "${name}".max must be a number`);
    }
    if (
      typeof d.min === "number" &&
      typeof d.max === "number" &&
      d.min > d.max
    ) {
      errors.push(`Field "${name}".min must be <= max`);
    }
    if (d.unique !== undefined) {
      if (typeof d.unique !== "boolean") {
        errors.push(`Field "${name}".unique must be a boolean`);
      } else if (d.unique && d.type !== "string" && d.type !== "number") {
        errors.push(`Field "${name}".unique is only supported for string/number fields`);
      }
    }
    if (d.default !== undefined && FIELD_TYPES.includes(d.type as LifemarkFieldType)) {
      if (!matchesType(d.default, d.type as LifemarkFieldType)) {
        errors.push(`Field "${name}".default must match its declared type`);
      } else if (d.enum && !d.enum.includes(d.default as string | number)) {
        errors.push(`Field "${name}".default must be one of its enum values`);
      }
    }
  }
  return errors;
}

function matchesType(value: unknown, type: LifemarkFieldType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "number[]":
      return Array.isArray(value) && value.every((v) => typeof v === "number");
    case "object":
      return typeof value === "object" && value !== null;
    default:
      return false;
  }
}

/** Validate a RECORD against a schema. Returns error strings; empty = valid. */
export function validateRecordAgainstSchema(
  data: Record<string, unknown>,
  schema: LifemarkCollectionSchema,
): string[] {
  const errors: string[] = [];
  const fields = schema.fields ?? {};
  for (const [name, def] of Object.entries(fields)) {
    const value = data[name];
    if (value === undefined || value === null) {
      if (def.required) errors.push(`Missing required field "${name}"`);
      continue;
    }
    if (!matchesType(value, def.type)) {
      errors.push(`Field "${name}" must be of type ${def.type}`);
      continue;
    }
    if (def.enum && !def.enum.includes(value as string | number)) {
      errors.push(`Field "${name}" must be one of: ${def.enum.join(", ")}`);
    }
    // min/max — value range for numbers, length for strings and arrays
    const measure =
      def.type === "number"
        ? (value as number)
        : typeof value === "string" || Array.isArray(value)
          ? (value as string | unknown[]).length
          : null;
    if (measure !== null) {
      const what = def.type === "number" ? "" : " length";
      if (typeof def.min === "number" && measure < def.min) {
        errors.push(`Field "${name}"${what} must be >= ${def.min}`);
      }
      if (typeof def.max === "number" && measure > def.max) {
        errors.push(`Field "${name}"${what} must be <= ${def.max}`);
      }
    }
  }
  for (const name of Object.keys(data)) {
    if (!(name in fields)) {
      errors.push(`Unknown field "${name}" — declare it in the schema or remove it`);
    }
  }
  return errors;
}

/**
 * Prepare a record for writing: apply defaults, coerce common form-input
 * mistakes (HTML inputs produce strings — "42" for a number field, "true"
 * for a boolean), then validate. Returns the prepared data plus any errors.
 */
export function prepareRecordForWrite(
  data: Record<string, unknown>,
  schema: LifemarkCollectionSchema,
): { data: Record<string, unknown>; errors: string[] } {
  const out: Record<string, unknown> = { ...data };
  for (const [name, def] of Object.entries(schema.fields ?? {})) {
    let value = out[name];
    if ((value === undefined || value === null) && def.default !== undefined) {
      out[name] = def.default;
      continue;
    }
    if (value === undefined || value === null) continue;
    if (def.type === "number" && typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) value = n;
    } else if (def.type === "boolean" && (value === "true" || value === "false")) {
      value = value === "true";
    } else if (def.type === "string" && typeof value === "number") {
      value = String(value);
    }
    out[name] = value;
  }
  return { data: out, errors: validateRecordAgainstSchema(out, schema) };
}

/** Names of fields declared unique (server enforces across the collection). */
export function uniqueFields(schema: LifemarkCollectionSchema): string[] {
  return Object.entries(schema.fields ?? {})
    .filter(([, def]) => def.unique === true)
    .map(([name]) => name);
}

function tsType(def: LifemarkFieldDef): string {
  if (def.enum) {
    return def.enum.map((v) => (typeof v === "string" ? JSON.stringify(v) : String(v))).join(" | ");
  }
  switch (def.type) {
    case "string[]":
      return "string[]";
    case "number[]":
      return "number[]";
    case "object":
      return "Record<string, unknown>";
    default:
      return def.type;
  }
}

function interfaceName(collection: string): string {
  const pascal = collection
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return pascal.replace(/s$/, "") || "Record";
}

/**
 * Base44 parity #2 — generate a lifemark-data.d.ts from declared schemas so
 * later AI edits see the exact shapes earlier builds committed to.
 */
export function typesFromSchemas(
  schemas: Record<string, LifemarkCollectionSchema>,
): string {
  const lines: string[] = [
    "// Generated by LifemarkAI from the declared LifemarkData schemas.",
    "// Regenerated whenever a schema changes — do not edit by hand.",
    "",
  ];
  const entries = Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b));
  for (const [collection, schema] of entries) {
    const name = interfaceName(collection);
    lines.push(`export interface ${name} {`);
    for (const [field, def] of Object.entries(schema.fields ?? {})) {
      lines.push(`  ${field}${def.required ? "" : "?"}: ${tsType(def)};`);
    }
    lines.push("}");
    lines.push("");
  }
  lines.push("export interface LifemarkRecord<T> { id: string; data: T; created_at: string; }");
  lines.push("");
  lines.push("declare global {");
  lines.push("  interface Window {");
  lines.push("    LifemarkData: {");
  lines.push("      hosted: boolean;");
  lines.push("      defineSchema(collection: string, fields: Record<string, { type: string; required?: boolean; enum?: Array<string | number> }>): Promise<void>;");
  lines.push("      list<T = Record<string, unknown>>(collection: string): Promise<Array<LifemarkRecord<T>>>;");
  lines.push("      create<T = Record<string, unknown>>(collection: string, data: T): Promise<LifemarkRecord<T>>;");
  lines.push("      update<T = Record<string, unknown>>(collection: string, id: string, data: T): Promise<LifemarkRecord<T>>;");
  lines.push("      remove(collection: string, id: string): Promise<{ ok: true }>;");
  lines.push("    };");
  lines.push("  }");
  lines.push("}");
  lines.push("");
  lines.push("export {};");
  return lines.join("\n");
}
