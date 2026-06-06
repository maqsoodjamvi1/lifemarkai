import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getKeywordMetrics,
  getRelatedKeywords,
  getDomainOverview,
  isSemrushConfigured,
  SemrushNotConfiguredError,
  type SemrushDatabase,
} from "@/lib/integrations/semrush";

const VALID_DB = new Set(["us", "uk", "ca", "au", "de", "fr", "es", "it", "br", "in"]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const action = req.nextUrl.searchParams.get("action") ?? "keyword";
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const dbParam = (req.nextUrl.searchParams.get("database") ?? "us").toLowerCase();
  const database = (VALID_DB.has(dbParam) ? dbParam : "us") as SemrushDatabase;

  if (!q) {
    return NextResponse.json({ error: "Missing query parameter q" }, { status: 400 });
  }

  if (!isSemrushConfigured()) {
    return NextResponse.json({
      configured: false,
      error: "Semrush API key not configured. Add SEMRUSH_API_KEY to your server environment.",
    }, { status: 503 });
  }

  try {
    if (action === "domain") {
      const domain = await getDomainOverview(q, database);
      return NextResponse.json({ configured: true, action, domain });
    }

    if (action === "related") {
      const related = await getRelatedKeywords(q, database);
      return NextResponse.json({ configured: true, action, related });
    }

    const [keyword, related] = await Promise.all([
      getKeywordMetrics(q, database),
      getRelatedKeywords(q, database, 8),
    ]);
    return NextResponse.json({ configured: true, action: "keyword", keyword, related });
  } catch (err) {
    if (err instanceof SemrushNotConfiguredError) {
      return NextResponse.json({ configured: false, error: err.message }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Semrush request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
