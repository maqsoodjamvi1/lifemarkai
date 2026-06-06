import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const NETLIFY_API = "https://api.netlify.com/api/v1";

async function netlifyFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (!NETLIFY_TOKEN) throw new Error("NETLIFY_AUTH_TOKEN not configured");
  const res = await fetch(`${NETLIFY_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${NETLIFY_TOKEN}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Netlify ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, name, deployed_url")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Read custom_domain safely
  const customDomain = (project as Record<string, unknown>).custom_domain as string | null ?? null;

  return NextResponse.json({
    customDomain,
    deployedUrl: project.deployed_url ?? null,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, domain } = await req.json() as { projectId: string; domain: string };

  if (!projectId || !domain) {
    return NextResponse.json({ error: "projectId and domain required" }, { status: 400 });
  }

  const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  if (!domainRegex.test(domain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
  }

  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let dnsInstructions: { type: string; name: string; value: string }[] = [];
  const isApex = domain.split(".").length === 2;

  if (NETLIFY_TOKEN) {
    try {
      const siteName = `lifemark-${projectId.slice(0, 12)}`;
      const sites = await netlifyFetch<Array<{ id: string; name: string }>>(`/sites?name=${encodeURIComponent(siteName)}`);
      const site = sites.find((s) => s.name === siteName);
      if (site) {
        await netlifyFetch(`/sites/${site.id}/aliases`, {
          method: "POST",
          body: JSON.stringify({ alias: domain }),
        });
      }
    } catch (err) {
      console.error("Netlify domain error:", err);
    }

    dnsInstructions = isApex
      ? [
          { type: "A", name: "@", value: "75.2.60.5" },
          { type: "A", name: "@", value: "99.83.190.102" },
        ]
      : [
          { type: "CNAME", name: domain.split(".")[0], value: `lifemark-${projectId.slice(0, 12)}.netlify.app` },
        ];
  } else {
    dnsInstructions = [
      {
        type: "CNAME",
        name: isApex ? "@" : domain.split(".")[0],
        value: `lifemark-${projectId.slice(0, 12)}.lifemarkai.app`,
      },
    ];
  }

  await (supabase as any)
    .from("projects")
    .update({ custom_domain: domain } as Record<string, unknown>)
    .eq("id", projectId);

  return NextResponse.json({
    domain,
    status: "pending_dns",
    dnsInstructions,
    message: "Domain saved. Configure the DNS records below and SSL provisions automatically within minutes.",
  });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  await (supabase as any)
    .from("projects")
    .update({ custom_domain: null } as Record<string, unknown>)
    .eq("id", projectId)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
