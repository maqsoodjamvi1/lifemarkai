import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { lookup } from "node:dns/promises";
import { randomBytes } from "node:crypto";

/**
 * Native /api/workspace/branded-urls — workspace-level branded URLs.
 *   GET    — current branded config + verified domains
 *   POST   — add a domain to verify (returns DNS TXT instructions) or ?action=verify
 *   PATCH  — enable/disable branded URLs (requires verified domain)
 *   DELETE — remove a verified domain
 */
function deriveSubdomain(domain: string): string {
  return domain.toLowerCase().replace(/^www\./, "").replace(/\./g, "-");
}

export const Route = createFileRoute("/api/workspace/branded-urls")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

        return Response.json({ branded: profile ?? {}, domains: domains ?? [] });
      },

      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { domain, action } = (await request.json()) as { domain?: string; action?: string };
        if (!domain) return Response.json({ error: "domain required" }, { status: 400 });

        const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

        if (action === "verify") {
          const { data: row } = await supabase
            .from("workspace_domains")
            .select("id, verification_token, verified_at")
            .eq("user_id", user.id)
            .eq("domain", cleanDomain)
            .maybeSingle();
          if (!row) return Response.json({ error: "Domain not registered" }, { status: 404 });
          if (row.verified_at) return Response.json({ ok: true, verified: true, already: true });

          try {
            await lookup(`_lifemark.${cleanDomain}`).catch(() => null);
            const dns = await import("node:dns/promises");
            const txt = await dns.resolveTxt(`_lifemark.${cleanDomain}`).catch(() => [] as string[][]);
            const flat = txt.map((arr) => arr.join("")).join(" ");
            if (!flat.includes(row.verification_token)) {
              return Response.json({
                error: "TXT record not found",
                expected: `TXT _lifemark.${cleanDomain} = ${row.verification_token}`,
                hint: "Add the TXT record at your DNS provider; propagation can take a few minutes.",
              }, { status: 400 });
            }
            await supabase
              .from("workspace_domains")
              .update({ verified_at: new Date().toISOString() })
              .eq("id", row.id);
            return Response.json({ ok: true, verified: true });
          } catch (err) {
            return Response.json({ error: `DNS check failed: ${(err as Error).message}` }, { status: 500 });
          }
        }

        const token = `lifemark-verify-${randomBytes(16).toString("hex")}`;
        const { data, error } = await supabase
          .from("workspace_domains")
          .insert({ user_id: user.id, domain: cleanDomain, verification_token: token })
          .select()
          .single();
        if (error && error.code !== "23505") {
          return Response.json({ error: error.message }, { status: 500 });
        }
        const final = data ?? (await supabase
          .from("workspace_domains")
          .select("*")
          .eq("user_id", user.id)
          .eq("domain", cleanDomain)
          .single()).data;

        if (!final) {
          return Response.json({ error: "Domain could not be created" }, { status: 500 });
        }

        return Response.json({
          ok: true,
          domain: final,
          instructions: {
            type: "TXT",
            name: `_lifemark.${cleanDomain}`,
            value: final.verification_token,
            ttl: 300,
          },
        });
      },

      PATCH: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { enable, sourceDomain } = (await request.json()) as { enable: boolean; sourceDomain?: string };

        if (!enable) {
          const { error: disableError } = await supabase
            .from("profiles")
            .update({
              branded_status: "inactive",
              branded_subdomain: null,
              branded_source_domain: null,
              branded_activated_at: null,
            })
            .eq("id", user.id);
          if (disableError) return Response.json({ error: disableError.message }, { status: 500 });
          return Response.json({ ok: true, status: "inactive" });
        }

        if (!sourceDomain) return Response.json({ error: "sourceDomain required when enabling" }, { status: 400 });
        const { data: verified } = await supabase
          .from("workspace_domains")
          .select("verified_at")
          .eq("user_id", user.id)
          .eq("domain", sourceDomain)
          .maybeSingle();
        if (!verified?.verified_at) {
          return Response.json({ error: "Source domain is not verified" }, { status: 400 });
        }

        const subdomain = deriveSubdomain(sourceDomain);
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

        const { error: enableError } = await supabase
          .from("profiles")
          .update({
            branded_subdomain: final,
            branded_source_domain: sourceDomain,
            branded_status: "active",
            branded_activated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
        // Previously unchecked: on the rare loss of the 5-try uniqueness
        // race, the DB's unique index correctly rejects this update, but the
        // caller still got back {ok:true, status:"active"} for a row that
        // was never actually written.
        if (enableError) return Response.json({ error: "Could not activate branded subdomain — it may already be taken. Try again." }, { status: 409 });

        return Response.json({
          ok: true,
          status: "active",
          subdomain: final,
          pattern: `{app}.${final}.lifemarkai.app`,
        });
      },

      DELETE: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const domain = new URL(request.url).searchParams.get("domain");
        if (!domain) return Response.json({ error: "domain required" }, { status: 400 });

        const { error: deleteError } = await supabase.from("workspace_domains").delete().eq("user_id", user.id).eq("domain", domain);
        if (deleteError) return Response.json({ error: deleteError.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
