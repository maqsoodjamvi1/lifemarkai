/**
 * Native domains server-fns — reimplemented off the worker.
 * Ports of app/api/domains/{route,search,verify,entri}. checkout+purchase
 * are separate (need lib/plans/gating).
 */
import { createClient } from "../supabase/server.ts";
import { getRegistrar,isPurchaseEnabled } from "../domains/registrar.ts";
import {
buildEntriConnectConfig,
connectDnsRecords,
domainVerificationToken,
isEntriConfigured,
} from "../domains/entri.ts";
// Hosting lives in one module now. This file used to carry its own Netlify
// client and its own hand-written DNS record table, which disagreed with the
// copy in entri.ts — see the note on connectDnsRecords.
import {
dnsRecordsForDomain,
getHostingTarget,
verifyDomainAgainstTarget,
HostingNotConfiguredError,
} from "../domains/hosting.ts";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type ProjectInput = { projectId: string };
type DomainInput = ProjectInput & { domain: string };
type DomainSearchInput = { query: string; years?: number };

export async function getProjectDomain(data: ProjectInput) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId) return { status: "bad_request" as const, message: "projectId required" };
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, deployed_url, custom_domain")
      .eq("id", data.projectId)
      .eq("user_id", user.id)
      .single();
    if (!project) return { status: "not_found" as const };
    return {
      status: "ok" as const,
      customDomain: project.custom_domain ?? null,
      deployedUrl: project.deployed_url ?? null,
    };
}

export async function setProjectDomain(data: DomainInput) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId || !data.domain) return { status: "bad_request" as const, message: "projectId and domain required" };
    const domain = data.domain.trim().toLowerCase();
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/;
    if (!domainRegex.test(domain)) return { status: "bad_request" as const, message: "Invalid domain format" };

    const { data: project } = await supabase
      .from("projects").select("id, name, custom_domain").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    const projectId = data.projectId;
    const verifyToken = domainVerificationToken(domain, projectId);
    const dnsInstructions = dnsRecordsForDomain(projectId, domain, verifyToken);

    // Attach FIRST, and let a failure be a failure.
    //
    // This used to swallow the error (`catch { console.error }`) and then
    // return "SSL provisions automatically within minutes" no matter what
    // happened. Combined with the old attach silently no-opping for any project
    // that had never been published, the overwhelmingly common outcome was a
    // confident success message, correct-looking DNS records, and a domain that
    // could never work. The user's only feedback was that it never went live.
    //
    // Saving the domain even when the attach fails would recreate the same lie
    // one layer down: the panel would show a configured domain the host knows
    // nothing about. So the row is written only after the host accepts it.
    try {
      await getHostingTarget().attachHostname(projectId, domain);
    } catch (err) {
      const message = err instanceof HostingNotConfiguredError
        ? err.message
        : `Could not attach ${domain} to the hosting target: ${err instanceof Error ? err.message : String(err)}`;
      return { status: "hosting_error" as const, message };
    }

    const { error: updateError } = await supabase
      .from("projects")
      .update({
        custom_domain: domain,
        custom_domain_token: verifyToken,
        custom_domain_verified: false,
      })
      .eq("id", projectId);
    if (updateError) {
      await getHostingTarget().detachHostname(projectId, domain).catch(() => {});
      return { status: "database_error" as const, message: "Could not save the custom domain" };
    }
    if (project.custom_domain && project.custom_domain !== domain) {
      await getHostingTarget().detachHostname(projectId, project.custom_domain).catch(() => {});
    }

    return {
      status: "ok" as const,
      payload: {
        domain,
        status: "pending_dns",
        dnsInstructions,
        verifyToken,
        message:
          "Domain attached. Add the DNS records below at your provider — SSL provisions automatically " +
          "once they propagate and verification passes.",
      },
    };
}

export async function deleteProjectDomain(data: ProjectInput) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId) return { status: "bad_request" as const, message: "projectId required" };

    // Detach from the host too, not just from our row. Clearing the column
    // alone left the hostname aliased on Netlify forever: the project stopped
    // claiming the domain while still answering for it, so the domain could
    // never be moved to another project and the stale alias kept serving.
    const { data: project } = await supabase
      .from("projects").select("custom_domain").eq("id", data.projectId).eq("user_id", user.id).single();
    const existing = project?.custom_domain;
    if (existing) {
      // Best-effort: a host that already lost the alias should not block the
      // user from clearing their own setting.
      await getHostingTarget().detachHostname(data.projectId, existing).catch(() => {});
    }

    const { error } = await supabase
      .from("projects")
      .update({
        custom_domain: null,
        custom_domain_token: null,
        custom_domain_verified: false,
      })
      .eq("id", data.projectId)
      .eq("user_id", user.id);
    if (error) {
      return { status: "database_error" as const, message: "Could not clear the custom domain" };
    }
    return { status: "ok" as const };
}

export async function searchDomains(data: DomainSearchInput) {
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
    const requestedYears = Number.isFinite(data.years) ? Math.trunc(data.years ?? 1) : 1;
    const suggestions = await registrar.search(data.query.trim(), Math.min(Math.max(requestedYears, 1), 10));
    return { status: "ok" as const, payload: { configured: true, registrar: registrar.id, suggestions } };
}

export async function verifyDomain(data: DomainInput) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.domain || !data.projectId) return { status: "bad_request" as const, message: "domain and projectId required" };
    const { data: project } = await supabase
      .from("projects").select("id, custom_domain, custom_domain_token").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    // This used to call dns.lookup() and mark the domain verified if it
    // resolved to ANYTHING. A domain pointed at Google verified. A domain still
    // parked at its registrar verified. A domain belonging to someone else
    // entirely verified — so `custom_domain_verified` certified nothing beyond
    // "this string is a real domain on the internet", while the UI presented it
    // as proof the site was live and owned.
    //
    // verifyDomainAgainstTarget checks the two things the flag is supposed to
    // mean: the records point at OUR hosting target, and a TXT token only the
    // project owner could have been given is present. Both must hold.
    const verifyToken =
      project.custom_domain_token ?? domainVerificationToken(data.domain, data.projectId);
    const result = await verifyDomainAgainstTarget(data.projectId, data.domain, verifyToken);

    const { error: updateError } = await supabase
      .from("projects")
      .update({ custom_domain_verified: result.live })
      .eq("id", data.projectId);
    if (updateError) {
      return { status: "database_error" as const, message: "Could not save domain verification status" };
    }

    return {
      status: "ok" as const,
      payload: {
        domain: data.domain,
        // `resolved` is kept for the existing panel, but now means "points at
        // us", not "resolves at all".
        resolved: result.pointsAtTarget,
        pointsAtTarget: result.pointsAtTarget,
        ownershipVerified: result.ownershipVerified,
        live: result.live,
        resolvedTo: result.resolved.a?.join(", ") ?? result.resolved.cname?.join(", ") ?? null,
        expected: result.expected,
        error: result.live ? null : result.message,
        message: result.message,
      },
    };
}

export async function entriConnect(data: DomainInput) {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.projectId || !data.domain) return { status: "bad_request" as const, message: "projectId and domain are required" };
    const domain = data.domain.trim().toLowerCase();
    const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
    if (!domainRegex.test(domain)) return { status: "bad_request" as const, message: "Invalid domain format" };

    const { data: project } = await supabase
      .from("projects").select("id, custom_domain").eq("id", data.projectId).eq("user_id", user.id).single();
    if (!project) return { status: "not_found" as const };

    const verifyToken = domainVerificationToken(domain, data.projectId);

    // Attach to the host here too. This route was writing custom_domain and a
    // domain_registrations row without ever telling the hosting edge the
    // hostname existed — so a domain connected through the Entri flow got
    // perfect DNS pointing at a Netlify site that would not answer for it.
    // Same call as setProjectDomain, from the same module, so the two connect
    // paths cannot diverge.
    try {
      await getHostingTarget().attachHostname(data.projectId, domain);
    } catch (err) {
      const message = err instanceof HostingNotConfiguredError
        ? err.message
        : `Could not attach ${domain} to the hosting target: ${err instanceof Error ? err.message : String(err)}`;
      return { status: "hosting_error" as const, message };
    }

    const { error: projectUpdateError } = await supabase.from("projects").update({
      custom_domain: domain, custom_domain_token: verifyToken, custom_domain_verified: false,
    }).eq("id", data.projectId);
    if (projectUpdateError) {
      await getHostingTarget().detachHostname(data.projectId, domain).catch(() => {});
      return { status: "database_error" as const, message: "Could not save the custom domain" };
    }

    const { error: registrationError } = await supabase.from("domain_registrations").upsert({
      project_id: data.projectId, user_id: user.id, domain, registrar: "namecom",
      status: "dns_pending", verify_token: verifyToken, metadata: { source: "connect" },
    }, { onConflict: "domain" });
    if (registrationError) {
      await supabase.from("projects").update({
        custom_domain: project.custom_domain,
        custom_domain_token: null,
        custom_domain_verified: false,
      }).eq("id", data.projectId);
      await getHostingTarget().detachHostname(data.projectId, domain).catch(() => {});
      return { status: "database_error" as const, message: "Could not save the domain registration" };
    }
    if (project.custom_domain && project.custom_domain !== domain) {
      await getHostingTarget().detachHostname(data.projectId, project.custom_domain).catch(() => {});
    }

    const entri = await buildEntriConnectConfig(domain, data.projectId);
    if (entri) return { status: "ok" as const, payload: { mode: "entri", ...entri } };
    return {
      status: "ok" as const,
      payload: {
        mode: "manual",
        entriConfigured: isEntriConfigured(),
        prefilledDomain: domain,
        dnsRecords: connectDnsRecords(domain, data.projectId),
        message: isEntriConfigured()
          ? "Entri token unavailable; use the manual DNS records below."
          : "Add these DNS records at your domain provider, then verify.",
      },
    };
}
