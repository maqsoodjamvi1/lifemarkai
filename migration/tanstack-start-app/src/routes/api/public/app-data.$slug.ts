/**
 * Public LifemarkData API (improvement #3) — the hosted persistence backend
 * for published static-runtime apps. Keyed by published app slug; served with
 * CORS so it works from custom domains and srcdoc frames.
 *
 * Hard caps (defense for a public write API):
 *   - collection: lowercase slug, ≤48 chars
 *   - ≤1000 rows per collection, ≤32KB per record
 *   - per-IP rate limit via the shared limiter
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { parseBody } from "@/lib/api/parse-body";
import {
APP_DATA_MAX_RECORD_BYTES,
APP_DATA_MAX_ROWS_PER_COLLECTION,
} from "@/lib/preview/lifemark-data";
import {
  SCHEMA_COLLECTION,
  prepareRecordForWrite,
  uniqueFields,
  validateSchemaDefinition,
  type LifemarkCollectionSchema,
} from "@/lib/preview/lifemark-schema";

/**
 * Enforce unique-declared fields across the collection. Returns error
 * strings for values already taken by ANOTHER record.
 */
async function uniqueViolations(
  projectId: string,
  collection: string,
  schema: LifemarkCollectionSchema,
  data: Record<string, unknown>,
  excludeId?: string,
): Promise<string[]> {
  const supabase = createAdminClient();
  const errors: string[] = [];
  for (const name of uniqueFields(schema)) {
    const value = data[name];
    if (value === undefined || value === null) continue;
    let query = supabase
      .from("app_data")
      .select("id")
      .eq("project_id", projectId)
      .eq("collection", collection)
      .eq(`data->>${name}`, String(value))
      .limit(1);
    if (excludeId) query = query.neq("id", excludeId);
    const { data: rows } = await query;
    if (rows && rows.length > 0) {
      errors.push(`Field "${name}" must be unique — "${String(value)}" is already taken`);
    }
  }
  return errors;
}

const collectionSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9_-]+$/i, "Invalid collection name");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rateLimited(request: Request): Response | null {
  const limit = rateLimit(`app-data:${clientIp(request)}`, RATE_LIMITS.api);
  if (!limit.success) return json({ error: "Rate limit exceeded — slow down." }, 429);
  return null;
}

/**
 * Load the declared schema for a collection (or null). Schemas live in the
 * reserved __schema__ collection as {collection, fields} records.
 */
async function loadSchema(
  projectId: string,
  collection: string,
): Promise<{ recordId: string | null; schema: LifemarkCollectionSchema | null }> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("app_data")
    .select("id, data")
    .eq("project_id", projectId)
    .eq("collection", SCHEMA_COLLECTION)
    .eq("data->>collection", collection)
    .limit(1)
    .maybeSingle();
  if (!data) return { recordId: null, schema: null };
  const row = data as { id: string; data: { fields?: unknown } };
  const fields = row.data?.fields;
  if (typeof fields !== "object" || fields === null) return { recordId: row.id, schema: null };
  return { recordId: row.id, schema: { fields } as LifemarkCollectionSchema };
}

/** Resolve a published project's id from its slug (or app_slug). */
async function resolveProject(slug: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("projects")
    .select("id, slug, app_slug, visibility, deployed_url")
    .or(`slug.eq.${slug},app_slug.eq.${slug}`)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return (data as { id: string }).id;
}

export const Route = createFileRoute("/api/public/app-data/$slug")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ params, request }) => {
        const limited = rateLimited(request);
        if (limited) return limited;
        const url = new URL(request.url);
        const parsed = collectionSchema.safeParse(url.searchParams.get("collection") ?? "");
        if (!parsed.success) return json({ error: "Invalid collection" }, 400);

        const projectId = await resolveProject(params.slug);
        if (!projectId) return json({ error: "App not found" }, 404);

        // Optional query params: where=field:value (single equality filter)
        // and limit=N (1..500) — enough for list pages without client-side
        // filtering of the whole collection.
        const limitParam = z.coerce.number().int().min(1).max(500)
          .safeParse(url.searchParams.get("limit") ?? 500);
        const whereRaw = url.searchParams.get("where");
        let whereField: string | null = null;
        let whereValue: string | null = null;
        if (whereRaw) {
          const idx = whereRaw.indexOf(":");
          const field = idx > 0 ? whereRaw.slice(0, idx) : "";
          const value = idx > 0 ? whereRaw.slice(idx + 1) : "";
          if (!/^[a-zA-Z][a-zA-Z0-9_]{0,47}$/.test(field) || value.length > 256) {
            return json({ error: "Invalid where filter — use field:value" }, 400);
          }
          whereField = field;
          whereValue = value;
        }

        const supabase = createAdminClient();
        let query = supabase
          .from("app_data")
          .select("id, data, created_at, updated_at")
          .eq("project_id", projectId)
          .eq("collection", parsed.data.toLowerCase());
        if (whereField !== null && whereValue !== null) {
          query = query.eq(`data->>${whereField}`, whereValue);
        }
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(limitParam.success ? limitParam.data : 500);
        if (error) return json({ error: error.message }, 500);
        return json({ records: data ?? [] });
      },

      POST: async ({ params, request }) => {
        const limited = rateLimited(request);
        if (limited) return limited;
        const body = await parseBody(
          request,
          z.object({
            collection: collectionSchema,
            data: z.record(z.string(), z.unknown()).optional(),
            schema: z.object({ fields: z.record(z.string(), z.unknown()) }).optional(),
            seed: z.array(z.record(z.string(), z.unknown())).min(1).max(100).optional(),
          }).refine(
            (b) => [b.data, b.schema, b.seed].filter((x) => x !== undefined).length === 1,
            { message: "Provide exactly one of data, schema or seed" },
          ),
        );
        if (body instanceof Response) return body;

        const projectId = await resolveProject(params.slug);
        if (!projectId) return json({ error: "App not found" }, 404);

        const supabase = createAdminClient();
        const collection = body.collection.toLowerCase();

        // ── Schema definition upsert (LifemarkData.defineSchema) ────────────
        if (body.schema) {
          const defErrors = validateSchemaDefinition(body.schema);
          if (defErrors.length) {
            return json({ error: `Invalid schema: ${defErrors.join("; ")}` }, 422);
          }
          const existing = await loadSchema(projectId, collection);
          const record = { collection, fields: body.schema.fields };
          const result = existing.recordId
            ? await supabase
                .from("app_data")
                .update({ data: record as never })
                .eq("id", existing.recordId)
                .select("id")
                .maybeSingle()
            : await supabase
                .from("app_data")
                .insert({
                  project_id: projectId,
                  collection: SCHEMA_COLLECTION,
                  data: record as never,
                })
                .select("id")
                .single();
          if (result.error) return json({ error: result.error.message }, 500);

          // Schema evolution safety: report how many EXISTING records no
          // longer conform (e.g. a field became required), so the AI can
          // migrate data instead of discovering breakage at the next write.
          const parsedSchema = { fields: body.schema.fields } as LifemarkCollectionSchema;
          const { data: sample } = await supabase
            .from("app_data")
            .select("id, data")
            .eq("project_id", projectId)
            .eq("collection", collection)
            .limit(200);
          let nonconforming = 0;
          const sampleErrors: string[] = [];
          for (const row of (sample ?? []) as Array<{ id: string; data: Record<string, unknown> }>) {
            const check = prepareRecordForWrite(row.data ?? {}, parsedSchema);
            if (check.errors.length) {
              nonconforming++;
              if (sampleErrors.length < 3) sampleErrors.push(`record ${row.id}: ${check.errors[0]}`);
            }
          }
          return json({
            ok: true,
            schema: record,
            ...(nonconforming > 0 ? { warnings: { nonconforming, sample: sampleErrors } } : {}),
          });
        }

        // ── Idempotent bulk seeding (LifemarkData.seed) ─────────────────────
        // Inserts ONLY when the collection is empty, closing the race where
        // two first visitors of a published app both see [] and double-seed.
        if (body.seed) {
          if (collection === SCHEMA_COLLECTION) {
            return json({ error: "Reserved collection" }, 400);
          }
          const { count: existing } = await supabase
            .from("app_data")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId)
            .eq("collection", collection);
          if ((existing ?? 0) > 0) return json({ ok: true, seeded: 0 });

          const { schema } = await loadSchema(projectId, collection);
          const rows: Array<Record<string, unknown>> = [];
          const seen = new Map<string, Set<string>>();
          for (const [i, raw] of body.seed.entries()) {
            if (JSON.stringify(raw).length > APP_DATA_MAX_RECORD_BYTES) {
              return json({ error: `Seed row ${i} too large` }, 413);
            }
            let row = raw as Record<string, unknown>;
            if (schema) {
              const prepared = prepareRecordForWrite(row, schema);
              if (prepared.errors.length) {
                return json(
                  {
                    error: `Schema validation failed (${collection}, seed row ${i}): ${prepared.errors.join("; ")}`,
                    details: prepared.errors,
                  },
                  422,
                );
              }
              row = prepared.data;
              // intra-batch uniqueness for unique-declared fields
              for (const name of uniqueFields(schema)) {
                const value = row[name];
                if (value === undefined || value === null) continue;
                const set = seen.get(name) ?? new Set<string>();
                if (set.has(String(value))) {
                  return json(
                    { error: `Seed rows duplicate unique field "${name}" value "${String(value)}"` },
                    422,
                  );
                }
                set.add(String(value));
                seen.set(name, set);
              }
            }
            rows.push(row);
          }
          const insertedSeed = await supabase
            .from("app_data")
            .insert(rows.map((r) => ({ project_id: projectId, collection, data: r as never })));
          if (insertedSeed.error) return json({ error: insertedSeed.error.message }, 500);
          return json({ ok: true, seeded: rows.length });
        }

        // ── Record insert (validated against the schema when one exists) ────
        if (collection === SCHEMA_COLLECTION) {
          return json({ error: "Reserved collection" }, 400);
        }
        let data = body.data as Record<string, unknown>;
        if (JSON.stringify(data).length > APP_DATA_MAX_RECORD_BYTES) {
          return json({ error: "Record too large" }, 413);
        }
        const { schema } = await loadSchema(projectId, collection);
        if (schema) {
          const prepared = prepareRecordForWrite(data, schema);
          const errors = prepared.errors.length
            ? prepared.errors
            : await uniqueViolations(projectId, collection, schema, prepared.data);
          if (errors.length) {
            return json(
              {
                error: `Schema validation failed (${collection}): ${errors.join("; ")}`,
                details: errors,
              },
              422,
            );
          }
          data = prepared.data;
        }
        const { count } = await supabase
          .from("app_data")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("collection", collection);
        if ((count ?? 0) >= APP_DATA_MAX_ROWS_PER_COLLECTION) {
          return json({ error: "Collection row limit reached" }, 409);
        }

        const inserted = await supabase
          .from("app_data")
          .insert({ project_id: projectId, collection, data: data as never })
          .select("id, data, created_at, updated_at")
          .single();
        if (inserted.error) return json({ error: inserted.error.message }, 500);
        return json({ record: inserted.data });
      },

      PATCH: async ({ params, request }) => {
        const limited = rateLimited(request);
        if (limited) return limited;
        const body = await parseBody(
          request,
          z.object({
            id: z.string().uuid(),
            collection: collectionSchema.optional(),
            data: z.record(z.string(), z.unknown()),
          }),
        );
        if (body instanceof Response) return body;
        if (JSON.stringify(body.data).length > APP_DATA_MAX_RECORD_BYTES) {
          return json({ error: "Record too large" }, 413);
        }

        const projectId = await resolveProject(params.slug);
        if (!projectId) return json({ error: "App not found" }, 404);

        const supabase = createAdminClient();

        // Validate against the collection's schema. Older SDKs don't send the
        // collection with PATCH — look it up from the record in that case.
        let collection = body.collection?.toLowerCase() ?? null;
        if (!collection) {
          const { data: row } = await supabase
            .from("app_data")
            .select("collection")
            .eq("id", body.id)
            .eq("project_id", projectId)
            .maybeSingle();
          collection = (row as { collection: string } | null)?.collection ?? null;
        }
        if (collection === SCHEMA_COLLECTION) {
          return json({ error: "Reserved collection" }, 400);
        }
        let patchData = body.data as Record<string, unknown>;
        if (collection) {
          const { schema } = await loadSchema(projectId, collection);
          if (schema) {
            const prepared = prepareRecordForWrite(patchData, schema);
            const errors = prepared.errors.length
              ? prepared.errors
              : await uniqueViolations(projectId, collection, schema, prepared.data, body.id);
            if (errors.length) {
              return json(
                {
                  error: `Schema validation failed (${collection}): ${errors.join("; ")}`,
                  details: errors,
                },
                422,
              );
            }
            patchData = prepared.data;
          }
        }

        const { data, error } = await supabase
          .from("app_data")
          .update({ data: patchData as never })
          .eq("id", body.id)
          .eq("project_id", projectId)
          .select("id, data, created_at, updated_at")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        if (!data) return json({ error: "Record not found" }, 404);
        return json({ record: data });
      },

      DELETE: async ({ params, request }) => {
        const limited = rateLimited(request);
        if (limited) return limited;
        const url = new URL(request.url);
        const id = z.string().uuid().safeParse(url.searchParams.get("id") ?? "");
        if (!id.success) return json({ error: "Invalid id" }, 400);

        const projectId = await resolveProject(params.slug);
        if (!projectId) return json({ error: "App not found" }, 404);

        const supabase = createAdminClient();
        const { error } = await supabase
          .from("app_data")
          .delete()
          .eq("id", id.data)
          .eq("project_id", projectId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      },
    },
  },
});
