import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/analytics/beacon
 * Called by deployed apps to record pageviews and heartbeats.
 * Body: { projectId, visitorKey, path?, referrer?, event: "pageview"|"heartbeat"|"leave" }
 *
 * GET /api/analytics/beacon?projectId=xxx
 * Returns { activeVisitors: number, todayViews: number }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400, headers: CORS });

  const supabase = await createAdminClient();

  // Active visitors (seen in last 90 seconds)
  const { count: activeVisitors } = await (supabase as any)
    .from("app_visitors")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("last_seen", new Date(Date.now() - 90_000).toISOString());

  // Today's pageviews
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count: todayViews } = await (supabase as any)
    .from("project_views")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .gte("created_at", startOfDay.toISOString());

  return NextResponse.json({ activeVisitors: activeVisitors ?? 0, todayViews: todayViews ?? 0 }, { headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: { projectId?: string; visitorKey?: string; path?: string; referrer?: string; event?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const { projectId, visitorKey, path = "/", referrer, event = "pageview" } = body;
  if (!projectId || !visitorKey) {
    return NextResponse.json({ error: "projectId and visitorKey required" }, { status: 400, headers: CORS });
  }

  const supabase = await createAdminClient();

  if (event === "leave") {
    // Remove visitor on tab close
    await (supabase as any)
      .from("app_visitors")
      .delete()
      .eq("project_id", projectId)
      .eq("visitor_key", visitorKey);
    return NextResponse.json({ ok: true }, { headers: CORS });
  }

  const userAgent = req.headers.get("user-agent");

  // Upsert active visitor
  await (supabase as any)
    .from("app_visitors")
    .upsert(
      {
        project_id: projectId,
        visitor_key: visitorKey,
        path,
        referrer: referrer ?? null,
        user_agent: userAgent,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "project_id,visitor_key" }
    );

  // Record pageview on first load
  if (event === "pageview") {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const country = req.headers.get("cf-ipcountry") ?? null;
    // Simple hash of IP to protect privacy
    const ipHash = ip ? Buffer.from(ip + (process.env.NEXT_PUBLIC_APP_URL ?? "salt")).toString("base64").slice(0, 16) : null;

    await (supabase as any)
      .from("project_views")
      .insert({
        project_id: projectId,
        ip_hash: ipHash,
        referrer: referrer ?? null,
        country_code: country,
        path,
        user_agent: userAgent,
      });
  }

  // Cleanup stale visitors occasionally (1 in 10 requests)
  if (Math.random() < 0.1) {
    await (supabase as any).rpc("cleanup_stale_visitors").catch(() => {});
  }

  return NextResponse.json({ ok: true }, { headers: CORS });
}
