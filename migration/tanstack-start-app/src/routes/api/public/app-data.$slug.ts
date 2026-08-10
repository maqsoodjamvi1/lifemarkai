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

        const supabase = createAdminClient();
        const { data, error } = await supabase
          .from("app_data")
          .select("id, data, created_at, updated_at")
          .eq("project_id", projectId)
          .eq("collection", parsed.data.toLowerCase())
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return json({ error: error.message }, 500);
        return json({ records: data ?? [] });
      },

      POST: async ({ params, request }) => {
        const limited = rateLimited(request);
        if (limited) return limited;
        const body = await parseBody(
          request,
          z.object({ collection: collectionSchema, data: z.record(z.string(), z.unknown()) }),
        );
        if (body instanceof Response) return body;
        if (JSON.stringify(body.data).length > APP_DATA_MAX_RECORD_BYTES) {
          return json({ error: "Record too large" }, 413);
        }

        const projectId = await resolveProject(params.slug);
        if (!projectId) return json({ error: "App not found" }, 404);

        const supabase = createAdminClient();
        const collection = body.collection.toLowerCase();
        const { count } = await supabase
          .from("app_data")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("collection", collection);
        if ((count ?? 0) >= APP_DATA_MAX_ROWS_PER_COLLECTION) {
          return json({ error: "Collection row limit reached" }, 409);
        }

        const { data, error } = await supabase
          .from("app_data")
          .insert({ project_id: projectId, collection, data: body.data as never })
          .select("id, data, created_at, updated_at")
          .single();
        if (error) return json({ error: error.message }, 500);
        return json({ record: data });
      },

      PATCH: async ({ params, request }) => {
        const limited = rateLimited(request);
        if (limited) return limited;
        const body = await parseBody(
          request,
          z.object({ id: z.string().uuid(), data: z.record(z.string(), z.unknown()) }),
        );
        if (body instanceof Response) return body;
        if (JSON.stringify(body.data).length > APP_DATA_MAX_RECORD_BYTES) {
          return json({ error: "Record too large" }, 413);
        }

        const projectId = await resolveProject(params.slug);
        if (!projectId) return json({ error: "App not found" }, 404);

        const supabase = createAdminClient();
        const { data, error } = await supabase
          .from("app_data")
          .update({ data: body.data as never })
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
