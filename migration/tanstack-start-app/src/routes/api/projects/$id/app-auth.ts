// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/projects/:id/app-auth — auth providers for a built app's end-users.
 *   GET list · POST enable (google|saml|oidc, managed|byok) · PATCH update · DELETE disable
 */
const VALID_PROVIDERS = ["google", "saml", "oidc"];

export const Route = createFileRoute("/api/projects/$id/app-auth")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data } = await supabase
          .from("app_auth_providers")
          .select("*")
          .eq("project_id", id)
          .eq("user_id", user.id);

        const sanitised = (data ?? []).map((row: any) => {
          const cfg = { ...(row.config ?? {}) };
          for (const k of Object.keys(cfg)) {
            if (/secret|password|key|token/i.test(k)) cfg[k] = cfg[k] ? "•••••••• (set)" : null;
          }
          return { ...row, config: cfg };
        });
        return Response.json({ providers: sanitised });
      },

      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { provider, mode, config } = (await request.json()) as {
          provider: string; mode?: "managed" | "byok"; config?: Record<string, unknown>;
        };
        if (!provider || !VALID_PROVIDERS.includes(provider)) {
          return Response.json({ error: "Invalid provider" }, { status: 400 });
        }

        const { data: project } = await supabase
          .from("projects").select("id").eq("id", id).eq("user_id", user.id).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const safeMode = mode ?? "managed";
        const validatedConfig = config ?? {};

        if (provider === "google" && safeMode === "byok") {
          for (const k of ["client_id", "client_secret"]) {
            if (!(k in validatedConfig)) {
              return Response.json({
                error: `Google BYOK requires ${k}`,
                required: ["client_id", "client_secret"],
                docs: "https://console.cloud.google.com/apis/credentials",
              }, { status: 400 });
            }
          }
        }
        if (provider === "saml") {
          for (const k of ["idp_entity_id", "idp_sso_url", "idp_x509_cert"]) {
            if (!(k in validatedConfig)) {
              return Response.json({
                error: `SAML requires ${k}`,
                required: ["idp_entity_id", "idp_sso_url", "idp_x509_cert"],
                callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/saml/${id}/callback`,
              }, { status: 400 });
            }
          }
        }
        if (provider === "oidc") {
          for (const k of ["issuer", "client_id", "client_secret"]) {
            if (!(k in validatedConfig)) {
              return Response.json({
                error: `OIDC requires ${k}`,
                required: ["issuer", "client_id", "client_secret"],
                callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/oidc/${id}/callback`,
              }, { status: 400 });
            }
          }
        }

        const { data, error } = await supabase
          .from("app_auth_providers")
          .upsert({
            project_id: id,
            user_id: user.id,
            provider,
            mode: safeMode,
            enabled: true,
            config: validatedConfig,
            updated_at: new Date().toISOString(),
          }, { onConflict: "project_id,provider" })
          .select()
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({
          ok: true,
          provider: data,
          next_steps: provider === "saml" ? {
            acs_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/saml/${id}/callback`,
            entity_id: `${process.env.NEXT_PUBLIC_APP_URL}/saml/${id}`,
            note: "Provide these to your IdP (Okta / Entra ID / OneLogin / etc.) when creating the SAML application.",
          } : undefined,
        });
      },

      PATCH: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { provider, enabled, configPatch } = await request.json();
        if (!provider) return Response.json({ error: "provider required" }, { status: 400 });

        const updates: any = { updated_at: new Date().toISOString() };
        if (typeof enabled === "boolean") updates.enabled = enabled;

        if (configPatch) {
          const { data: existing } = await supabase
            .from("app_auth_providers")
            .select("config")
            .eq("project_id", id)
            .eq("user_id", user.id)
            .eq("provider", provider)
            .maybeSingle();
          updates.config = { ...(existing?.config ?? {}), ...configPatch };
        }

        const { error } = await supabase
          .from("app_auth_providers")
          .update(updates)
          .eq("project_id", id)
          .eq("user_id", user.id)
          .eq("provider", provider);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },

      DELETE: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const provider = new URL(request.url).searchParams.get("provider");
        if (!provider) return Response.json({ error: "provider required" }, { status: 400 });

        await supabase
          .from("app_auth_providers")
          .delete()
          .eq("project_id", id)
          .eq("user_id", user.id)
          .eq("provider", provider);
        return Response.json({ ok: true });
      },
    },
  },
});
