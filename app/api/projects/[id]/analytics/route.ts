// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface Params { params: Promise<{ id: string }> }

const DAY_MS = 24 * 60 * 60 * 1000;

/** Bucket a raw user-agent string into a coarse device class. */
function deviceFromUA(ua: string | null | undefined): "Desktop" | "Mobile" | "Tablet" | "Bot" | "Unknown" {
  if (!ua) return "Unknown";
  const s = ua.toLowerCase();
  if (/bot|crawler|spider|crawling|preview|facebookexternalhit|slurp|bingpreview/i.test(s)) return "Bot";
  if (/tablet|ipad|playbook|silk|kindle/.test(s)) return "Tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry|opera mini/.test(s)) return "Mobile";
  return "Desktop";
}

/** Normalize a referrer URL down to a host the user will recognize, or null for direct. */
function hostFromReferrer(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const trimmed = ref.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return u.host.replace(/^www\./, "");
  } catch {
    // Not a full URL — return as-is so we still get *some* grouping
    return trimmed.replace(/^www\./, "");
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = id;

  // Selectable range from ?range=7|30|90 (default 7 — Lovable's default)
  const rangeParam = req.nextUrl.searchParams.get("range");
  const rangeDays = rangeParam && /^(7|30|90)$/.test(rangeParam) ? parseInt(rangeParam, 10) : 7;
  const rangeStartMs = Date.now() - rangeDays * DAY_MS;
  const rangeStartIso = new Date(rangeStartMs).toISOString();

  // Verify access (owner or collaborator)
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, name, created_at, deployed_url")
    .eq("id", projectId)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (project.user_id !== user.id) {
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!collab) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch all metrics in parallel.
  // recentViews is windowed by ?range so the panel's tiles + chart all reflect the picker.
  // totalViewsLifetime is kept for the lifetime KPI.
  const [
    messagesRes,
    deploymentsRes,
    filesRes,
    snapshotsRes,
    recentViewsRes,
    totalViewsLifetimeRes,
    activeVisitorsRes,
  ] = await Promise.all([
    (supabase as any)
      .from("messages")
      .select("id, mode, created_at, tokens_used")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    (supabase as any)
      .from("deployments")
      .select("id, status, created_at, deployed_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    (supabase as any)
      .from("project_files")
      .select("id, path, language, updated_at")
      .eq("project_id", projectId),
    (supabase as any)
      .from("project_snapshots")
      .select("id, created_at, is_baseline")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    (supabase as any)
      .from("project_views")
      .select("id, created_at, ip_hash, country_code, referrer, path, user_agent")
      .eq("project_id", projectId)
      .gte("created_at", rangeStartIso),
    (supabase as any)
      .from("project_views")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId),
    (supabase as any)
      .from("app_visitors")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .gte("last_seen", new Date(Date.now() - 90_000).toISOString()),
  ]);

  const messages = messagesRes.data ?? [];
  const deployments = deploymentsRes.data ?? [];
  const files = filesRes.data ?? [];
  const snapshots = snapshotsRes.data ?? [];
  const recentViews: Array<{
    created_at: string;
    ip_hash: string | null;
    country_code: string | null;
    referrer: string | null;
    path: string | null;
    user_agent: string | null;
  }> = recentViewsRes.data ?? [];
  const totalViewsLifetime = totalViewsLifetimeRes.count ?? 0;
  const activeVisitors = activeVisitorsRes.count ?? 0;

  // ── Build daily series for the chart and tiles ─────────────────────────────
  const dayKeys: string[] = [];
  for (let d = 0; d < rangeDays; d++) {
    const t = rangeStartMs + d * DAY_MS;
    dayKeys.push(new Date(t).toISOString().slice(0, 10));
  }

  const viewsByDay: Record<string, { pageviews: number; visitors: Set<string> }> = {};
  for (const k of dayKeys) viewsByDay[k] = { pageviews: 0, visitors: new Set<string>() };

  for (const v of recentViews) {
    const day = v.created_at.slice(0, 10);
    if (!viewsByDay[day]) continue; // outside the window edges
    viewsByDay[day].pageviews++;
    if (v.ip_hash) viewsByDay[day].visitors.add(v.ip_hash);
  }

  const visitorsByDay = dayKeys.map((d) => ({
    date: d,
    visitors: viewsByDay[d].visitors.size,
    pageviews: viewsByDay[d].pageviews,
  }));

  // ── Site KPIs (Lovable-style) ──────────────────────────────────────────────
  const totalPageviews = recentViews.length;
  const uniqueVisitorIds = new Set(recentViews.map((v) => v.ip_hash).filter(Boolean) as string[]);
  const totalVisitors = uniqueVisitorIds.size;
  const viewsPerVisit = totalVisitors > 0 ? totalPageviews / totalVisitors : 0;

  // Approximate session duration: for each visitor, span between their first and last view in the window.
  // Single-pageview visitors get 0s (matches the screenshot's 0s when there's only one view).
  // Bounce = sessions with exactly one pageview / total sessions.
  const perVisitor: Record<string, { first: number; last: number; count: number }> = {};
  for (const v of recentViews) {
    if (!v.ip_hash) continue;
    const ts = new Date(v.created_at).getTime();
    const entry = perVisitor[v.ip_hash];
    if (!entry) {
      perVisitor[v.ip_hash] = { first: ts, last: ts, count: 1 };
    } else {
      entry.first = Math.min(entry.first, ts);
      entry.last = Math.max(entry.last, ts);
      entry.count++;
    }
  }
  const visitorEntries = Object.values(perVisitor);
  const avgVisitDurationSec =
    visitorEntries.length > 0
      ? Math.round(visitorEntries.reduce((s, e) => s + (e.last - e.first), 0) / visitorEntries.length / 1000)
      : 0;
  const bouncedSessions = visitorEntries.filter((e) => e.count <= 1).length;
  const bounceRatePct =
    visitorEntries.length > 0 ? Math.round((bouncedSessions / visitorEntries.length) * 100) : 0;

  // ── Breakdown tiles ────────────────────────────────────────────────────────
  // Source = referrer host, or "Direct" when null/empty.
  // Page = request path, defaulting to "/".
  // Country = country_code as before.
  // Device = bucketed from user_agent.
  const sourceMap: Record<string, number> = {};
  const pageMap: Record<string, number> = {};
  const countryMap: Record<string, number> = {};
  const deviceMap: Record<string, number> = {};

  for (const v of recentViews) {
    const src = hostFromReferrer(v.referrer) ?? "Direct";
    sourceMap[src] = (sourceMap[src] ?? 0) + 1;

    const page = v.path && v.path.trim() ? v.path : "/";
    pageMap[page] = (pageMap[page] ?? 0) + 1;

    if (v.country_code) countryMap[v.country_code] = (countryMap[v.country_code] ?? 0) + 1;

    const dev = deviceFromUA(v.user_agent);
    deviceMap[dev] = (deviceMap[dev] ?? 0) + 1;
  }

  function topN(map: Record<string, number>, n = 5) {
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, n)
      .map(([label, count]) => ({ label, count }));
  }

  const sources = topN(sourceMap);
  const pages = topN(pageMap);
  const countries = topN(countryMap);
  const devices = topN(deviceMap, 4);

  // ── Builder/project metrics (kept for ProjectActivityPanel) ────────────────
  const builds = messages.filter((m) => m.mode === "build");
  const chats  = messages.filter((m) => m.mode === "chat");
  const totalTokens = messages.reduce((s, m) => s + (m.tokens_used ?? 0), 0);
  const liveDeployments = deployments.filter((d) => d.status === "live");

  // Activity-by-day for the activity panel (last 30d builds/chats/deploys)
  const thirtyDaysAgo = Date.now() - 30 * DAY_MS;
  const activityMap: Record<string, { builds: number; chats: number; deploys: number; views: number }> = {};
  for (const m of messages) {
    const ts = new Date(m.created_at).getTime();
    if (ts < thirtyDaysAgo) continue;
    const day = m.created_at.slice(0, 10);
    if (!activityMap[day]) activityMap[day] = { builds: 0, chats: 0, deploys: 0, views: 0 };
    if (m.mode === "build") activityMap[day].builds++;
    else activityMap[day].chats++;
  }
  for (const d of deployments) {
    const ts = new Date(d.created_at).getTime();
    if (ts < thirtyDaysAgo) continue;
    const day = d.created_at.slice(0, 10);
    if (!activityMap[day]) activityMap[day] = { builds: 0, chats: 0, deploys: 0, views: 0 };
    activityMap[day].deploys++;
  }
  for (const v of recentViews) {
    const day = v.created_at.slice(0, 10);
    if (!activityMap[day]) activityMap[day] = { builds: 0, chats: 0, deploys: 0, views: 0 };
    activityMap[day].views++;
  }
  const activityByDay = Object.entries(activityMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ date, ...counts }));

  // Language breakdown
  const langMap: Record<string, number> = {};
  for (const f of files) {
    const lang = f.language || "plaintext";
    langMap[lang] = (langMap[lang] ?? 0) + 1;
  }
  const languageBreakdown = Object.entries(langMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([language, count]) => ({ language, count }));

  return NextResponse.json({
    // ── Lovable-style site analytics ──
    range: rangeDays,
    activeVisitors,
    site: {
      visitors: totalVisitors,
      pageviews: totalPageviews,
      viewsPerVisit: Number(viewsPerVisit.toFixed(2)),
      avgVisitDurationSec,
      bounceRatePct,
    },
    visitorsByDay,
    sources,
    pages,
    countries,
    devices,

    // ── Existing fields preserved so the new activity panel can read them ──
    summary: {
      totalMessages: messages.length,
      buildGenerations: builds.length,
      chatMessages: chats.length,
      totalDeployments: deployments.length,
      liveDeployments: liveDeployments.length,
      totalFiles: files.length,
      totalSnapshots: snapshots.length,
      totalTokensUsed: totalTokens,
      projectAge: project.created_at,
      totalViews: totalViewsLifetime,
      recentViews: totalPageviews,
      uniqueVisitors: totalVisitors,
    },
    activityByDay,
    languageBreakdown,
    topCountries: countries.map((c) => ({ country: c.label, count: c.count })),
    recentDeploys: deployments.slice(-5).reverse(),
  });
}
