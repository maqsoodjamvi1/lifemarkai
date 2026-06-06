import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain, projectId } = await req.json() as { domain: string; projectId: string };
  if (!domain || !projectId) return NextResponse.json({ error: "domain and projectId required" }, { status: 400 });

  // Verify project ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, custom_domain")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let resolved = false;
  let resolvedTo: string | null = null;
  let error: string | null = null;

  try {
    const addresses = await lookup(domain, { all: true });
    if (addresses.length > 0) {
      resolved = true;
      resolvedTo = addresses.map((a) => a.address).join(", ");
    }
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "DNS lookup failed";
  }

  // Update project domain status in DB if resolved
  if (resolved) {
    await (supabase as any)
      .from("projects")
      .update({ custom_domain_verified: true } as Record<string, unknown>)
      .eq("id", projectId);
  }

  return NextResponse.json({
    domain,
    resolved,
    resolvedTo,
    error,
    message: resolved
      ? `Domain resolves to ${resolvedTo}. SSL will provision within minutes.`
      : (error ?? "Domain not yet resolving — check DNS records and wait for propagation."),
  });
}
