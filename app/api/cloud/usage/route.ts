// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cloud/usage?projectId=...&days=7
 *
 * Returns per-category Cloud usage breakdown for the selected window,
 * matching Lovable Cloud's segmented-bar format.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") ?? "7"), 30);

  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from("lifemark_cloud_usage")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  const totals = {
    db_server_cents: 0,
    db_storage_cents: 0,
    compute_cents: 0,
    storage_cents: 0,
    live_updates_cents: 0,
    network_cents: 0,
    ai_cents: 0,
  };
  for (const r of (rows ?? [])) {
    totals.db_server_cents += r.db_server_cents ?? 0;
    totals.db_storage_cents += r.db_storage_cents ?? 0;
    totals.compute_cents += r.compute_cents ?? 0;
    totals.storage_cents += r.storage_cents ?? 0;
    totals.live_updates_cents += r.live_updates_cents ?? 0;
    totals.network_cents += r.network_cents ?? 0;
    totals.ai_cents += r.ai_cents ?? 0;
  }
  const totalCents = Object.values(totals).reduce((a, b) => a + b, 0);

  const breakdown = [
    { category: "Database server",  cents: totals.db_server_cents,    label: "DB Server" },
    { category: "Database storage", cents: totals.db_storage_cents,   label: "DB Storage" },
    { category: "Compute",          cents: totals.compute_cents,      label: "Compute" },
    { category: "Storage",          cents: totals.storage_cents,      label: "Storage" },
    { category: "Live updates",     cents: totals.live_updates_cents, label: "Realtime" },
    { category: "Network",          cents: totals.network_cents,      label: "Network" },
    { category: "AI",               cents: totals.ai_cents,           label: "AI" },
  ]
    .map((c) => ({ ...c, pct: totalCents > 0 ? Math.round((c.cents / totalCents) * 100) : 0 }))
    .sort((a, b) => b.cents - a.cents);

  return NextResponse.json({
    days,
    totalCents,
    breakdown,
    raw: rows ?? [],
  });
}
