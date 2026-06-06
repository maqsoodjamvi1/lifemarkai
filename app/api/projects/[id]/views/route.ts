import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const projectId = id;
  const supabase = await createClient();

  // Verify project is public (no auth required for public pages)
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, is_public")
    .eq("id", projectId)
    .single();

  if (!project?.is_public) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  // Get optional viewer identity
  const { data: { user } } = await supabase.auth.getUser();

  // Privacy-safe IP hash (SHA-256 of IP + server-side salt)
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const salt = process.env.IP_HASH_SALT ?? "lifemarkai-views-salt";
  const ipHash = createHash("sha256").update(ip + salt).digest("hex");

  const body = await req.json().catch(() => ({}));
  const referrer = typeof body.referrer === "string"
    ? body.referrer.slice(0, 255)
    : null;

  // Country from Cloudflare header
  const countryCode = req.headers.get("cf-ipcountry")?.slice(0, 2) ?? null;

  await (supabase as any).from("project_views").insert({
    project_id: projectId,
    viewer_id: user?.id ?? null,
    ip_hash: ipHash,
    referrer,
    country_code: countryCode,
  });

  return NextResponse.json({ ok: true });
}
