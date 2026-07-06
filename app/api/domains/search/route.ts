// @ts-nocheck
/**
 * POST /api/domains/search — domain availability + price via the configured
 * registrar (Name.com preferred). Body: { query, years? }.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRegistrar, isPurchaseEnabled } from "@/lib/domains/registrar";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { query, years = 1 } = (await req.json().catch(() => ({}))) as { query?: string; years?: number };
  if (!query || query.trim().length < 2) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const registrar = getRegistrar();
  if (!isPurchaseEnabled()) {
    return NextResponse.json({
      configured: false,
      registrar: registrar.id,
      suggestions: [],
      message: "In-product domain purchase isn't configured. Set NAMECOM_USERNAME + NAMECOM_API_TOKEN (or connect an existing domain via Entri).",
    });
  }

  const suggestions = await registrar.search(query.trim(), Math.min(Math.max(years, 1), 10));
  return NextResponse.json({ configured: true, registrar: registrar.id, suggestions });
}
