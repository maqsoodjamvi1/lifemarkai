// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

/**
 * Workspace-level branded URLs.
 *
 *  GET    — return current branded config + verified domains
 *  POST   — add a domain to verify (returns DNS TXT instructions)
 *  PATCH  — enable/disable branded URLs (requires verified domain)
 *  DELETE — remove a verified domain
 */

function deriveSubdomain(domain: string): string {
  // acme.com         → acme
  // acme.ai          → acme-ai
  // acme.co.uk       → acme-co-uk
  return domain.toLowerCase().replace(/^www\./, "").replace(/\./g, "-");
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: profile }, { data: domains }] = await Promise.all([
    supabase
      .from("profiles")
      .select("branded_subdomain, branded_source_domain, branded_status, branded_activated_at")
      .eq("id", user.id)
      .single(),
    supabase
      .from("workspace_domains")
      .select("id, domain, verification_token, verified_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    branded: profile ?? {},
    domains: domains ?? [],
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { domain, action } = await req.json() as { domain?: string; action?: string };
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  // Action: verify a previously-added domain by checking DNS TXT
  if (action === "verify") {
    const { data: row } = await supabase
      .from("workspace_domains")
      .select("id, verification_token, verified_at")
      .eq("user_id", user.id)
      .eq("domain", cleanDomain)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Domain not registered" }, { status: 404 });
    if (row.verified_at) return NextResponse.json({ ok: true, verified: true, already: true });

    try {
      const records = await lookup(`_lifemark.${cleanDomain}`).catch(() => null);
      // Try TXT records via Node dns
      const dns = await import("dns/promises");
      const txt = await dns.resolveTxt(`_lifemark.${cleanDomain}`).catch(() => [] as string[][]);
      const flat = txt.map((arr) => arr.join("")).join(" ");
      if (!flat.includes(row.verification_token)) {
        return NextResponse.json({
          error: "TXT record not found",
          expected: `TXT _lifemark.${cleanDomain} = ${row.verification_token}`,
          hint: "Add the TXT record at your DNS provider; propagation can take a few minutes.",
        }, { status: 400 });
      }
      await supabase
        .from("workspace_domains")
        .update({ verified_at: new Date().toISOString() })
        .eq("id", row.id);
      return NextResponse.json({ ok: true, verified: true });
    } catch (err) {
      return NextResponse.json({
        error: `DNS check failed: ${(err as Error).message}`,
      }, { status: 500 });
    }
  }

  // Default: register a new domain → return verification instructions
  const token = `lifemark-verify-${randomBytes(16).toString("hex")}`;
  const { data, error } = await supabase
    .from("workspace_domains")
    .insert({
      user_id: user.id,
      domain: cleanDomain,
      verification_token: token,
    })
    .select()
    .single();
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Already-registered case
  const final = data ?? (await supabase
    .from("workspace_domains")
    .select("*")
    .eq("user_id", user.id)
    .eq("domain", cleanDomain)
    .single()).data;

  return NextResponse.json({
    ok: true,
    domain: final,
    instructions: {
      type: "TXT",
      name: `_lifemark.${cleanDomain}`,
      value: final.verification_token,
      ttl: 300,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { enable, sourceDomain } = await req.json() as { enable: boolean; sourceDomain?: string };

  if (!enable) {
    await supabase
      .from("profiles")
      .update({
        branded_status: "inactive",
        branded_subdomain: null,
        branded_source_domain: null,
        branded_activated_at: null,
      })
      .eq("id", user.id);
    return NextResponse.json({ ok: true, status: "inactive" });
  }

  if (!sourceDomain) return NextResponse.json({ error: "sourceDomain required when enabling" }, { status: 400 });
  // Confirm source domain is verified
  const { data: verified } = await supabase
    .from("workspace_domains")
    .select("verified_at")
    .eq("user_id", user.id)
    .eq("domain", sourceDomain)
    .maybeSingle();
  if (!verified?.verified_at) {
    return NextResponse.json({ error: "Source domain is not verified" }, { status: 400 });
  }

  const subdomain = deriveSubdomain(sourceDomain);
  // Subdomain uniqueness — if taken by another workspace, suffix with random
  let final = subdomain;
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase
      .from("profiles")
      .select("id")
      .eq("branded_subdomain", final)
      .neq("id", user.id)
      .maybeSingle();
    if (!clash) break;
    final = `${subdomain}-${Math.floor(Math.random() * 10000)}`;
  }

  // Lifecycle: provisioning_dns → issuing_ssl → active. We jump straight to
  // active in this scaffold; real impl would queue a job that adds the wildcard
  // CNAME, waits for propagation, issues an SSL cert, then promotes.
  await supabase
    .from("profiles")
    .update({
      branded_subdomain: final,
      branded_source_domain: sourceDomain,
      branded_status: "active",
      branded_activated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  return NextResponse.json({
    ok: true,
    status: "active",
    subdomain: final,
    pattern: `{app}.${final}.lifemarkai.app`,
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) return NextResponse.json({ error: "domain required" }, { status: 400 });

  await supabase.from("workspace_domains").delete().eq("user_id", user.id).eq("domain", domain);
  return NextResponse.json({ ok: true });
}
