// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const RESEND_API = "https://api.resend.com";
const RESEND_KEY = process.env.RESEND_API_KEY ?? "";

async function resendFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${RESEND_API}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
        ...(opts.headers ?? {}),
      },
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.message ?? json.name ?? "Resend API error" };
    return { data: json as T, error: null };
  } catch (err: unknown) {
    return { data: null, error: err instanceof Error ? err.message : "Network error" };
  }
}

// ── GET — list domains for the current user's project ─────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");

  // Return stored domain info from profiles/project settings
  const { data: profile } = await supabase
    .from("profiles")
    .select("resend_domain_id, resend_domain_name, resend_domain_status")
    .eq("id", user.id)
    .single();

  if (!profile?.resend_domain_id) {
    return NextResponse.json({ domain: null });
  }

  // Fetch live status from Resend
  const { data: resendDomain, error } = await resendFetch<{
    id: string; name: string; status: string;
    records: Array<{ type: string; name: string; value: string; ttl: string; priority?: number; status: string }>;
  }>(`/domains/${profile.resend_domain_id}`);

  if (error || !resendDomain) {
    return NextResponse.json({
      domain: {
        id: profile.resend_domain_id,
        name: profile.resend_domain_name,
        status: profile.resend_domain_status ?? "not_started",
        records: [],
      },
    });
  }

  // Update cached status
  await supabase
    .from("profiles")
    .update({ resend_domain_status: resendDomain.status })
    .eq("id", user.id);

  return NextResponse.json({ domain: resendDomain });
}

// ── POST — add a new domain to Resend ────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, region = "us-east-1" } = await req.json() as { name: string; region?: string };

  if (!name?.trim()) return NextResponse.json({ error: "Domain name required" }, { status: 400 });

  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  if (!domainRegex.test(name.trim())) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  if (!RESEND_KEY) {
    return NextResponse.json({ error: "Resend not configured — set RESEND_API_KEY" }, { status: 503 });
  }

  const { data: domain, error } = await resendFetch<{
    id: string; name: string; status: string;
    records: Array<{ type: string; name: string; value: string; ttl: string; status: string }>;
  }>("/domains", {
    method: "POST",
    body: JSON.stringify({ name: name.trim(), region }),
  });

  if (error || !domain) {
    return NextResponse.json({ error: error ?? "Failed to add domain" }, { status: 500 });
  }

  // Save to profile
  await supabase
    .from("profiles")
    .update({
      resend_domain_id: domain.id,
      resend_domain_name: domain.name,
      resend_domain_status: domain.status,
    })
    .eq("id", user.id);

  return NextResponse.json({ domain });
}

// ── PATCH — trigger re-verification of an existing domain ────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("resend_domain_id")
    .eq("id", user.id)
    .single();

  if (!profile?.resend_domain_id) {
    return NextResponse.json({ error: "No domain registered yet" }, { status: 404 });
  }

  const { data: domain, error } = await resendFetch<{
    id: string; name: string; status: string;
    records: Array<{ type: string; name: string; value: string; ttl: string; status: string }>;
  }>(`/domains/${profile.resend_domain_id}/verify`, { method: "POST" });

  if (error || !domain) {
    // Fallback: just re-fetch status
    const { data: fetched } = await resendFetch<{ id: string; name: string; status: string; records: unknown[] }>(
      `/domains/${profile.resend_domain_id}`,
    );
    if (!fetched) return NextResponse.json({ error: error ?? "Failed to verify" }, { status: 500 });

    await supabase.from("profiles").update({ resend_domain_status: fetched.status }).eq("id", user.id);
    return NextResponse.json({ domain: fetched });
  }

  await supabase.from("profiles").update({ resend_domain_status: domain.status }).eq("id", user.id);
  return NextResponse.json({ domain });
}

// ── DELETE — remove domain from Resend + clear profile ───────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("resend_domain_id")
    .eq("id", user.id)
    .single();

  if (profile?.resend_domain_id) {
    await resendFetch(`/domains/${profile.resend_domain_id}`, { method: "DELETE" });
  }

  await supabase
    .from("profiles")
    .update({ resend_domain_id: null, resend_domain_name: null, resend_domain_status: null })
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
