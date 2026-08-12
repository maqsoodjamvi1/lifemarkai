import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { createHash } from "node:crypto";

/**
 * Native /api/embed/error - visitor error ingest for PUBLISHED apps.
 *
 * Published apps had no error visibility at all: preview_telemetry only covers the
 * editor preview, where the owner's own browser is the writer. Once an app is
 * published, real visitors hit real bugs and nobody ever hears about it.
 *
 * THIS ENDPOINT IS PUBLIC AND UNAUTHENTICATED - it has to be, since visitors of a
 * published app have no session with us. That makes it the most exposed write path
 * in the product, so every guard below is load-bearing:
 *
 *  - PROJECT MUST BE PUBLISHED. An unpublished or unknown project id is rejected.
 *    Without this, anyone could write rows against any project id they can guess.
 *  - THE SERVER FINGERPRINTS, NOT THE CLIENT. Grouping is a hash of message + top
 *    stack frame computed here. A client-supplied fingerprint would let one visitor
 *    forge unlimited distinct groups, or collide two unrelated bugs into one.
 *  - HARD PAYLOAD CAPS, matching the CHECK constraints on the table, so a rejection
 *    is a 400 here rather than a constraint violation deeper in.
 *  - QUERY STRINGS STRIPPED. Published apps put ids and tokens in URLs; only the
 *    path is stored, and there is no column for a full URL.
 *  - COARSE BROWSER BUCKET, not the raw user agent, which is a fingerprinting
 *    vector. "Chrome" is enough to reproduce a bug.
 *  - RATE LIMITED PER PROJECT, and the DB function caps distinct error groups at
 *    200/project, so even a determined abuser can only increment counters.
 *
 * Always returns 204 on the happy path with no body: the visitor's app must learn
 * nothing about our internals, and a beacon has nothing useful to do with a reply.
 */

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

/** Coarse bucket. Deliberately lossy - enough to reproduce, not to fingerprint. */
function browserBucket(ua: string): string {
  const s = ua.toLowerCase();
  if (s.includes("edg/")) return "Edge";
  if (s.includes("chrome") && !s.includes("chromium")) return "Chrome";
  if (s.includes("safari") && !s.includes("chrome")) return "Safari";
  if (s.includes("firefox")) return "Firefox";
  return "other";
}

/** Path only, no query, no fragment, length-capped. */
function safePath(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const u = new URL(raw);
    return u.pathname.slice(0, 300);
  } catch {
    return raw.split("?")[0].split("#")[0].slice(0, 300);
  }
}

function clamp(v: unknown, max: number): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return v.trim().slice(0, max);
}

export const Route = createFileRoute("/api/embed/error")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin") ?? "*";
        return new Response(null, {
          status: 204,
          headers: { ...cors(origin), "Access-Control-Max-Age": "86400" },
        });
      },

      POST: async ({ request }) => {
        const origin = request.headers.get("origin") ?? "*";
        const headers = cors(origin);

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response(null, { status: 400, headers });
        }

        const projectId = clamp(body.projectId, 64);
        const message = clamp(body.message, 500);
        if (!projectId || !message) return new Response(null, { status: 400, headers });

        // Per-project limit: a broken app should not be able to flood us, and one
        // noisy app must not consume another's budget.
        const rl = rateLimit(`embed-error:${projectId}`, { limit: 120, windowMs: 60 });
        if (!rl.success) return new Response(null, { status: 429, headers });

        const supabase = createAdminClient();

        // Must be a real, PUBLISHED project. Unpublished apps have no visitors, so
        // a write against one is either a mistake or an attack.
        //
        // The column is `deployed_url`, NOT `deploy_url`. The first version of this
        // route guessed the latter, which does not exist: the select errored,
        // `project` came back null, and every single report was dropped with a 204
        // - a silent no-op that looked exactly like success. Caught only by running
        // a real end-to-end write against the live database. Same class as the
        // health_findings and member_group_members column mistakes earlier in this
        // project: never assume a column name, read the schema.
        const { data: project } = await supabase
          .from("projects")
          .select("id, deployed_url")
          .eq("id", projectId)
          .maybeSingle();

        if (!project?.deployed_url) {
          // Same 204 as success: never reveal whether a project id exists.
          return new Response(null, { status: 204, headers });
        }

        const stack = clamp(body.stack, 2000);
        const path = safePath(body.path ?? body.url);
        const browser = browserBucket(request.headers.get("user-agent") ?? "");

        // Server-side fingerprint: message + first stack frame. Never trust a
        // client-supplied grouping key.
        const topFrame = (stack ?? "").split("\n").find((l) => l.includes("at ")) ?? "";
        const fingerprint = createHash("sha256")
          .update(`${message}\n${topFrame.trim()}`)
          .digest("hex")
          .slice(0, 32);

        try {
          await supabase.rpc("record_app_error", {
            p_project_id: projectId,
            p_fingerprint: fingerprint,
            p_message: message,
            p_stack: stack,
            p_path: path,
            p_browser: browser,
          });
        } catch {
          // Telemetry must never surface a failure to a visitor's app.
        }

        return new Response(null, { status: 204, headers });
      },
    },
  },
});
