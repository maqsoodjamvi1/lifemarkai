import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function readEnvFile(filePath) {
  try {
    const contents = await fs.readFile(filePath, "utf8");
    return Object.fromEntries(
      contents
        .split(/\r?\n/)
        .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
        .filter(Boolean)
        .map((match) => {
          let value = match[2].trim();
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }
          return [match[1], value];
        }),
    );
  } catch {
    return {};
  }
}

const localEnv = await readEnvFile(path.join(appRoot, ".env.local"));
const rootEnv = await readEnvFile(path.resolve(appRoot, "../..", ".env.local"));
const env = { ...rootEnv, ...localEnv, ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
}

const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/`, {
  headers: {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    accept: "application/openapi+json",
  },
});

if (!response.ok) {
  throw new Error(`Supabase schema request failed with HTTP ${response.status}.`);
}

const schema = await response.json();
const definitions = schema.definitions ?? {};

// Include committed migrations that have not reached the connected environment
// yet. Once migration 163 is deployed the live definition replaces these with
// the same shape, so generation remains deterministic during rollout.
if (definitions.api_keys?.properties && !definitions.api_keys.properties.scopes) {
  definitions.api_keys.properties.scopes = {
    type: "array",
    items: { type: "string" },
    default: ["read", "write"],
  };
  definitions.api_keys.required = [...new Set([...(definitions.api_keys.required ?? []), "scopes"])];
}

if (!definitions.project_feature_flags) {
  definitions.project_feature_flags = {
    required: [
      "id",
      "project_id",
      "key",
      "is_enabled",
      "rollout_pct",
      "created_by",
      "created_at",
      "updated_at",
    ],
    properties: {
      id: { type: "string", format: "uuid", default: "gen_random_uuid()" },
      project_id: {
        type: "string",
        format: "uuid",
        description: "<fk table='projects' column='id'/>",
      },
      key: { type: "string" },
      description: { type: "string" },
      is_enabled: { type: "boolean", default: false },
      rollout_pct: { type: "integer", default: 100 },
      created_by: { type: "string", format: "uuid" },
      created_at: { type: "string", format: "timestamp with time zone", default: "now()" },
      updated_at: { type: "string", format: "timestamp with time zone", default: "now()" },
    },
  };
}

function quote(value) {
  return JSON.stringify(String(value));
}

function propertyType(property = {}) {
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    return property.enum.map(quote).join(" | ");
  }
  if (property.format === "json" || property.format === "jsonb") return "Json";
  if (property.type === "array") return `Array<${propertyType(property.items)}>`;
  if (property.type === "boolean") return "boolean";
  if (property.type === "integer" || property.type === "number") return "number";
  if (property.type === "string") return "string";
  return "Json";
}

const openApiDefaultOmissions = new Set(["projects.disabled_skill_ids"]);

function renderShape(tableName, definition, mode) {
  const required = new Set(definition.required ?? []);
  const lines = Object.entries(definition.properties ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, property]) => {
      const nullable = !required.has(name);
      const hasDefault = Object.prototype.hasOwnProperty.call(property, "default");
      const optional =
        mode !== "row" &&
        (mode === "update" ||
          nullable ||
          hasDefault ||
          openApiDefaultOmissions.has(`${tableName}.${name}`));
      const type = `${propertyType(property)}${nullable ? " | null" : ""}`;
      return `            ${quote(name)}${optional ? "?" : ""}: ${type};`;
    });
  return lines.length > 0 ? lines.join("\n") : "            [key: string]: never;";
}

function renderRelationships(tableName, definition) {
  const relationships = Object.entries(definition.properties ?? {}).flatMap(
    ([column, property]) => {
      const match = String(property.description ?? "").match(
        /<fk table='([^']+)' column='([^']+)'\/>/,
      );
      if (!match) return [];
      return [
        {
          foreignKeyName: `${tableName}_${column}_fkey`,
          columns: [column],
          isOneToOne: false,
          referencedRelation: match[1],
          referencedColumns: [match[2]],
        },
      ];
    },
  );
  return JSON.stringify(relationships, null, 10).replace(/^/gm, "        ").trimStart();
}

const tableBlocks = Object.entries(definitions)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(
    ([name, definition]) => `      ${quote(name)}: {
        Row: {
${renderShape(name, definition, "row")}
        };
        Insert: {
${renderShape(name, definition, "insert")}
        };
        Update: {
${renderShape(name, definition, "update")}
        };
        Relationships: ${renderRelationships(name, definition)};
      };`,
  )
  .join("\n");

const rpcNames = Object.keys(schema.paths ?? {})
  .filter((route) => route.startsWith("/rpc/"))
  .map((route) => route.slice(5))
  .sort((left, right) => left.localeCompare(right));

const functionBlocks = rpcNames
  .map(
    (name) => `      ${quote(name)}: {
        Args: Record<string, Json | undefined>;
        Returns: Json;
      };`,
  )
  .join("\n");

const output = `/**
 * Generated from the live Supabase PostgREST OpenAPI contract.
 * Run \`npm run generate:database-types\` after applying migrations.
 * Do not add domain-specific unions here; keep those in database.ts overrides.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type GeneratedDatabase = {
  public: {
    Tables: {
${tableBlocks}
    };
    Views: Record<string, never>;
    Functions: {
${functionBlocks || "      [key: string]: never;"}
    };
    Enums: Record<string, never>;
  };
};
`;

const destination = path.join(appRoot, "src", "types", "database.generated.ts");
await fs.writeFile(destination, output, "utf8");
console.log(
  `Generated ${Object.keys(definitions).length} table/view definitions and ${rpcNames.length} RPC definitions.`,
);
