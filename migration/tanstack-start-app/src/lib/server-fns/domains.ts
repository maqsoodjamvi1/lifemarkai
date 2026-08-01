/**
 * Native domains server-fns — reimplemented off the worker.
 * Ports of app/api/domains/{route,search,verify,entri}. checkout+purchase
 * are separate (need lib/plans/gating).
 */
import { lookup } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { getRegistrar, isPurchaseEnabled } from "@/lib/domains/registrar";
import {
  buildEntriConnectConfig,
  connectDnsRecords,
  domainVerificationToken,
  isEntriConfigured,
} from "@/lib/domains/entri";

const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const NETLIFY_API = "https://api.netlify.com/api/v1";
async function netlifyFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if (!NETLIFY_TOKEN) throw new Error("NETLIFY_AUTH_TOKEN not configured");
  const res = await fetch(`${NETLIFY_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${NETLIFY_TOKEN}`, "Content-Type": "application/json", ...opts.headers },
  });
  if (!res.ok) throw new Error(`Netlify ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function getProjectDomain(data: any) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId) return { status: "bad_request" as const, message: "projectId required" };
    const { data: project } = await (supabase as any)
      .from("projects")
      .select("id, name, deployed_url, custom_domain")
      .eq("id", data.projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) return { status: "not_found" as const };
    return {
      status: "ok" as const,
      customDomain: (project as any).custom_domain ?? null,
      deployedUrl: project.deployed_url ?? null,
    };
}

export async function setProjectDomain(data: any) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId || !data.domain) return { status: "bad_request" as const, message: "projectId and domain required" };
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
    if (!domainRegex.test(data.domain)) return { status: "bad_request" as const, message: "Invalid domain format" };

    const { data: project } = await (supabase as any)
      .from("projects").select("id, name").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    const domain = data.domain;
    const projectId = data.projectId;
    const isApex = domain.split(".").length === 2;
    let dnsInstructions: { type: string; name: string; value: string }[] = [];

    if (NETLIFY_TOKEN) {
      try {
        const siteName = `lifemark-${projectId.slice(0, 12)}`;
        const sites = await netlifyFetch<Array<{ id: string; name: string }>>(`/sites?name=${encodeURIComponent(siteName)}`);
        const site = sites.find((s) => s.name === siteName);
        if (site) await netlifyFetch(`/sites/${site.id}/aliases`, { method: "POST", body: JSON.stringify({ alias: domain }) });
      } catch (err) {
        console.error("Netlify domain error:", err);
      }
      dnsInstructions = isApex
        ? [{ type: "A", name: "@", value: "75.2.60.5" }, { type: "A", name: "@", value: "99.83.190.102" }]
        : [{ type: "CNAME", name: domain.split(".")[0], value: `lifemark-${projectId.slice(0, 12)}.netlify.app` }];
    } else {
      dnsInstructions = [{ type: "CNAME", name: isApex ? "@" : domain.split(".")[0], value: `lifemark-${projectId.slice(0, 12)}.lifemarkai.app` }];
    }

    await (supabase as any).from("projects").update({ custom_domain: domain } as Record<string, unknown>).eq("id", projectId);
    return {
      status: "ok" as const,
      payload: {
        domain,
        status: "pending_dns",
        dnsInstructions,
        message: "Domain saved. Configure the DNS records below and SSL provisions automatically within minutes.",
      },
    };
}

export async function deleteProjectDomain(data: any) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId) return { status: "bad_request" as const, message: "projectId required" };
    await (supabase as any)
      .from("projects")
      .update({ custom_domain: null } as Record<string, unknown>)
      .eq("id", data.projectId)
      .eq("user_id", user.id);
    return { status: "ok" as const };
}

export async function searchDomains(data: any) {
    const { user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.query || data.query.trim().length < 2) return { status: "bad_request" as const, message: "query required" };
    const registrar = getRegistrar();
    if (!isPurchaseEnabled()) {
      return {
        status: "ok" as const,
        payload: {
          configured: false,
          registrar: registrar.id,
          suggestions: [],
          message: "In-product domain purchase isn't configured. Set NAMECOM_USERNAME + NAMECOM_API_TOKEN (or connect an existing domain via Entri).",
        },
      };
    }
    const suggestions = await registrar.search(data.query.trim(), Math.min(Math.max(data.years ?? 1, 1), 10));
    return { status: "ok" as const, payload: { configured: true, registrar: registrar.id, suggestions } };
}

export async function verifyDomain(data: any) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.domain || !data.projectId) return { status: "bad_request" as const, message: "domain and projectId required" };
    const { data: project } = await (supabase as any)
      .from("projects").select("id, custom_domain").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    let resolved = false;
    let resolvedTo: string | null = null;
    let error: string | null = null;
    try {
      const addresses = await lookup(data.domain, { all: true });
      if (addresses.length > 0) {
        resolved = true;
        resolvedTo = addresses.map((a) => a.address).join(", ");
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : "DNS lookup failed";
    }
    if (resolved) {
      await (supabase as any).from("projects").update({ custom_domain_verified: true } as Record<string, unknown>).eq("id", data.projectId);
    }
    return {
      status: "ok" as const,
      payload: {
        domain: data.domain,
        resolved,
        resolvedTo,
        error,
        message: resolved
          ? `Domain resolves to ${resolvedTo}. SSL will provision within minutes.`
          : error ?? "Domain not yet resolving — check DNS records and wait for propagation.",
      },
    };
}

export async function entriConnect(data: any) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId || !data.domain) return { status: "bad_request" as const, message: "projectId and domain are required" };
    const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    if (!domainRegex.test(data.domain)) return { status: "bad_request" as const, message: "Invalid domain format" };

    const { data: project } = await (supabase as any)
      .from("projects").select("id").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    const verifyToken = domainVerificationToken(data.domain, data.projectId);
    await (supabase as any).from("projects").update({
      custom_domain: data.domain, custom_domain_token: verifyToken, custom_domain_verified: false,
    }).eq("id", data.projectId);
    await (supabase as any).from("domain_registrations").upsert({
      project_id: data.projectId, user_id: user.id, domain: data.domain, registrar: "namecom",
      status: "dns_pending", verify_token: verifyToken, metadata: { source: "connect" },
    }, { onConflict: "domain" });

    const entri = await buildEntriConnectConfig(data.domain, data.projectId);
    if (entri) return { status: "ok" as const, payload: { mode: "entri", ...entri } };
    return {
      status: "ok" as const,
      payload: {
        mode: "manual",
        entriConfigured: isEntriConfigured(),
        prefilledDomain: data.domain,
        dnsRecords: connectDnsRecords(data.domain, data.projectId),
        message: isEntriConfigured()
          ? "Entri token unavailable; use the manual DNS records below."
          : "Add these DNS records at your domain provider, then verify.",
      },
    };
}
