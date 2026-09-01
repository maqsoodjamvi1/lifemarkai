import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { logAuditFromRequest } from "@/lib/audit/log";
import { requireFeature } from "@/lib/plans/gating";
import {
generateScimApiKey,
hashScimApiKey,
redactSsoForClient,
type WorkspaceEnforceSettings,
type WorkspaceScimConfig,
type WorkspaceSsoConfig,
} from "@/lib/workspace/identity";
import type { Database,Json } from "@/types/database";

/** Native /api/workspace/identity — SSO + SCIM workspace settings (GET/PATCH). */
export const Route = createFileRoute("/api/workspace/identity")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data } = await supabase
          .from("workspace_identity_settings")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle();

        const sso = redactSsoForClient((data?.sso_config as WorkspaceSsoConfig | null) ?? null);
        const scim = (data?.scim_config as WorkspaceScimConfig | null) ?? null;

        return Response.json({
          sso,
          scim: scim ? { ...scim, apiKeyPrefix: data?.scim_api_key_prefix ?? null } : null,
          enforceSettings: {
            enforceSso: data?.enforce_sso ?? false,
            ssoSessionDuration: data?.sso_session_duration ?? "24h",
            jitEnabled: data?.jit_enabled ?? true,
            jitDefaultRole: data?.jit_default_role ?? "editor",
          } satisfies WorkspaceEnforceSettings,
          verifiedDomains: data?.verified_domains ?? [],
          scimBaseUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.lifemarkai.com"}/api/scim/v2`,
        });
      },

      PATCH: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as {
          sso?: WorkspaceSsoConfig | null;
          scim?: Partial<WorkspaceScimConfig>;
          enforceSettings?: Partial<WorkspaceEnforceSettings>;
          verifiedDomains?: string[];
          rotateScimKey?: boolean;
          disableScim?: boolean;
        };

        const needsSso = body.sso !== undefined || body.enforceSettings !== undefined;
        const needsScim = body.scim !== undefined || body.rotateScimKey || body.disableScim;

        if (needsSso) {
          const gate = await requireFeature(user.id, "sso");
          if (!gate.ok) return Response.json({ error: gate.error, requiredPlan: gate.requiredPlan }, { status: gate.status });
        }
        if (needsScim) {
          const gate = await requireFeature(user.id, "scim");
          if (!gate.ok) return Response.json({ error: gate.error, requiredPlan: gate.requiredPlan }, { status: gate.status });
        }

        const { data: existing } = await supabase
          .from("workspace_identity_settings")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle();

        let scimApiKeyFull: string | undefined;
        let scimKeyHash = existing?.scim_api_key_hash ?? null;
        let scimKeyPrefix = existing?.scim_api_key_prefix ?? null;

        if (body.disableScim) {
          scimKeyHash = null;
          scimKeyPrefix = null;
        } else if (body.rotateScimKey || (body.scim?.enabled && !scimKeyHash)) {
          scimApiKeyFull = generateScimApiKey();
          scimKeyHash = hashScimApiKey(scimApiKeyFull);
          scimKeyPrefix = scimApiKeyFull.slice(0, 12) + "…";
        }

        const prevSso = (existing?.sso_config as WorkspaceSsoConfig | null) ?? null;
        let nextSso = prevSso;
        if (body.sso === null) {
          nextSso = null;
        } else if (body.sso) {
          nextSso = {
            ...body.sso,
            clientSecret:
              body.sso.clientSecret && body.sso.clientSecret !== "••••••••"
                ? body.sso.clientSecret
                : prevSso?.clientSecret,
            certificate:
              body.sso.certificate && body.sso.certificate !== "••••••••"
                ? body.sso.certificate
                : prevSso?.certificate,
          };
        }

        const prevScim = (existing?.scim_config as WorkspaceScimConfig | null) ?? {
          enabled: false,
          welcomeEmail: true,
          groupMappings: [],
        };
        const nextScim: WorkspaceScimConfig = body.disableScim
          ? { enabled: false, welcomeEmail: true, groupMappings: [] }
          : {
              ...prevScim,
              ...(body.scim ?? {}),
              enabled: body.disableScim ? false : (body.scim?.enabled ?? prevScim.enabled),
            };

        const enforce = body.enforceSettings ?? {};
        const row: Database["public"]["Tables"]["workspace_identity_settings"]["Insert"] = {
          owner_id: user.id,
          sso_config: nextSso as unknown as Json,
          scim_config: nextScim as unknown as Json,
          scim_api_key_hash: scimKeyHash,
          scim_api_key_prefix: scimKeyPrefix,
          enforce_sso: enforce.enforceSso ?? existing?.enforce_sso ?? false,
          sso_session_duration: enforce.ssoSessionDuration ?? existing?.sso_session_duration ?? "24h",
          jit_enabled: enforce.jitEnabled ?? existing?.jit_enabled ?? true,
          jit_default_role: enforce.jitDefaultRole ?? existing?.jit_default_role ?? "editor",
          verified_domains: body.verifiedDomains ?? existing?.verified_domains ?? [],
          updated_at: new Date().toISOString(),
        };

        const { error: upsertError } = await supabase.from("workspace_identity_settings").upsert(row);
        if (upsertError) {
          // Previously unchecked: on failure this still fell through to the
          // 200 response below, handing back a freshly generated plaintext
          // SCIM key that was never actually persisted — every subsequent
          // SCIM call using it would 401 with no way to tell why.
          return Response.json({ error: `Could not save identity settings: ${upsertError.message}` }, { status: 500 });
        }

        await logAuditFromRequest(request, {
          userId: user.id,
          action: body.sso === null ? "sso.delete" : body.rotateScimKey ? "scim.rotate_key" : "workspace.identity.update",
          resourceType: "workspace",
          resourceId: user.id,
          metadata: { hasSso: !!nextSso, scimEnabled: nextScim.enabled },
        });

        return Response.json({
          ok: true,
          sso: redactSsoForClient(nextSso),
          scim: { ...nextScim, apiKeyPrefix: scimKeyPrefix },
          scimApiKey: scimApiKeyFull,
          enforceSettings: {
            enforceSso: row.enforce_sso,
            ssoSessionDuration: row.sso_session_duration,
            jitEnabled: row.jit_enabled,
            jitDefaultRole: row.jit_default_role,
          },
        });
      },
    },
  },
});
