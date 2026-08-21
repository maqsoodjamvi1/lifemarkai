/**
 * POST /api/telemetry/client — sink for Phase 2 client telemetry
 * (web vitals, app timings, product/funnel events).
 *
 * Accepts the batch format produced by src/lib/analytics/client-telemetry.ts
 * and re-validates EVERYTHING server-side: the browser is untrusted, so the
 * client-side privacy filters are treated as a convenience, not a guarantee.
 * Names must come from fixed vocabularies, props must be enum-shaped scalars,
 * and identity fields must look like the 8-hex FNV hashes the client emits —
 * a raw UUID or email fails the regex and the row is dropped.
 *
 * Rows land in client_telemetry (migration 174). Ingestion is deliberately
 * anonymous-friendly (marketing pages have no session) but rate-limited by IP.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit,RATE_LIMITS } from "@/lib/rate-limit";

const SURFACES = ["marketing", "dashboard", "editor", "preview", "billing", "onboarding", "auth", "other"] as const;
const EVENT_NAMES = [
  "signup_completed", "project_created", "prompt_submitted", "build_started",
  "build_succeeded", "build_failed", "preview_ready", "backend_enabled",
  "deployment_completed", "upgrade_started", "subscription_completed",
] as const;
const TIMING_NAMES = [
  "editor_interactive", "monaco_loaded", "project_files_loaded",
  "first_stream_token_rendered", "preview_iframe_ready", "sandbox_ready",
] as const;
const VITAL_NAMES = ["LCP", "CLS", "INP", "FCP", "TTFB"] as const;

const itemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("vital"),
    name: z.enum(VITAL_NAMES),
    surface: z.enum(SURFACES),
    value: z.number().finite().min(0).max(600_000),
    sessionSample: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal("timing"),
    name: z.enum(TIMING_NAMES),
    surface: z.enum(SURFACES),
    value: z.number().finite().min(0).max(3_600_000),
    sessionSample: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal("event"),
    name: z.enum(EVENT_NAMES),
    surface: z.enum(SURFACES),
    props: z.record(
      z.string().regex(/^[a-zA-Z0-9_]{1,32}$/),
      z.union([z.number().finite(), z.boolean(), z.string().regex(/^[a-z0-9_-]{1,40}$/i)]),
    ).optional(),
    sessionSample: z.number().min(0).max(1),
  }),
]);

const bodySchema = z.object({
  batch: z.array(itemSchema).min(1).max(50),
  identity: z.object({
    userHash: z.string().regex(/^[a-f0-9]{8}$/).optional(),
    projectHash: z.string().regex(/^[a-f0-9]{8}$/).optional(),
  }).default({}),
});

export const Route = createFileRoute("/api/telemetry/client")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Silent 204s everywhere below: a telemetry endpoint that returns
        // errors teaches browsers (and attackers) more than it teaches us.
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        const limit = rateLimit(`client-telemetry:${ip}`, RATE_LIMITS.api);
        if (!limit.success) return new Response(null, { status: 204 });

        let parsed: z.infer<typeof bodySchema>;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return new Response(null, { status: 204 });
        }

        try {
          const supabase = createAdminClient();
          const now = new Date().toISOString();
          const rows = parsed.batch.map((item) => ({
            created_at: now,
            kind: item.kind,
            name: item.name,
            surface: item.surface,
            value: "value" in item ? item.value : null,
            props: item.kind === "event" ? (item.props ?? {}) : {},
            user_hash: parsed.identity.userHash ?? null,
            project_hash: parsed.identity.projectHash ?? null,
            session_sample: item.sessionSample,
          }));
          // `client_telemetry.id` is GENERATED ALWAYS AS IDENTITY. PostgREST still
          // reports it as required, so the generated Insert type demands an id the
          // database refuses to accept — the cast is the documented escape hatch.
          await (supabase.from("client_telemetry") as any).insert(rows);
        } catch {
          /* best-effort sink */
        }
        return new Response(null, { status: 204 });
      },
      OPTIONS: async () => new Response(null, { status: 204 }),
    },
  },
});
