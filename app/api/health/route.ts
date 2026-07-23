import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Health / readiness probe — for Coolify healthchecks, uptime monitors, and
 * load balancers. Unauthenticated by design; returns no sensitive data.
 *
 *   GET /api/health        → { status, db, uptime, version }
 *
 * `db` verifies an actual round-trip to Postgres (cheap HEAD count against a
 * public table) so a green response means the app can serve real traffic,
 * not merely that the process is alive.
 */

export const dynamic = "force-dynamic";

const startedAt = Date.now();

export async function GET() {
  let db = "ok";
  try {
    const supabase = await createClient();
    const { error } = await (supabase as any)
      .from("templates")
      .select("id", { count: "exact", head: true })
      .limit(1);
    if (error) db = "error";
  } catch {
    db = "error";
  }

  const healthy = db === "ok";
  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      db,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.SOURCE_COMMIT?.slice(0, 8) ?? "dev",
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
