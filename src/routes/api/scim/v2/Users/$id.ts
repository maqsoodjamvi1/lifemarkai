import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";
import type { WorkspaceScimConfig } from "@/lib/workspace/identity";

async function authenticateScim(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const hash = createHash("sha256").update(auth.slice(7).trim()).digest("hex");
  const supabase = createAdminClient();
  const { data } = await supabase.from("workspace_identity_settings").select("owner_id, scim_config").eq("scim_api_key_hash", hash).maybeSingle();
  if (!data?.owner_id) return null;
  const scim = data.scim_config as WorkspaceScimConfig | null;
  if (!scim?.enabled) return null;
  return data.owner_id as string;
}

function scimUserResource(row: Record<string, unknown>) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: row.id, externalId: row.external_id, userName: row.email, active: row.active,
    meta: { resourceType: "User" },
  };
}

/**
 * Remove the deactivated person from every team this SCIM workspace owner
 * runs — an accepted membership (matched by the auth user's email) and any
 * still-pending invite (matched by invited_email) alike. Mirrors exactly
 * what the "remove member" action in /api/teams/:id/members does
 * (`team_members.delete().eq("id", memberId).eq("team_id", teamId)`), just
 * driven by an IdP deprovisioning call instead of an admin click.
 *
 * No SSO login flow exists elsewhere in this codebase to sign the person
 * out of an active session — there is nothing to revoke there — but team
 * membership is real, checked access (RLS-gated project/credit-pool
 * reads), and is exactly what "an ex-employee retains access" means in
 * practice. Scoped to the SCIM owner's own teams only, so this can never
 * touch a team the deactivated person belongs to under a different owner.
 */
async function revokeTeamAccessForEmail(
  supabase: ReturnType<typeof createAdminClient>,
  ownerId: string,
  email: string,
): Promise<void> {
  const { data: ownedTeams } = await supabase.from("teams").select("id").eq("owner_id", ownerId);
  const teamIds = (ownedTeams ?? []).map((t) => t.id as string);
  if (teamIds.length === 0) return;

  // Pending invites: matched directly by the email column, no user lookup needed.
  await supabase.from("team_members").delete().in("team_id", teamIds).eq("invited_email", email);

  // Accepted members: team_members has no email column, so resolve the auth
  // user id first — same listUsers-and-find pattern already used elsewhere
  // in this codebase (src/routes/api/demo/create-sample-project.ts).
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (match) userId = match.id;
    if (data.users.length < 1000) break;
  }
  if (!userId) return;
  await supabase.from("team_members").delete().in("team_id", teamIds).eq("user_id", userId);
}

/** Native /api/scim/v2/Users/:id — GET one, PATCH (deactivate/update). Bearer-token auth. */
export const Route = createFileRoute("/api/scim/v2/Users/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ownerId = await authenticateScim(request);
        if (!ownerId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
        const body = (await request.json().catch(() => ({}))) as { Operations?: Array<{ op: string; path?: string; value?: unknown }>; active?: boolean };
        let active: boolean | undefined = body.active;
        if (body.Operations) {
          for (const op of body.Operations) {
            if (op.op === "replace" && op.path === "active") active = op.value === true || op.value === "true";
          }
        }
        const supabase = createAdminClient();
        const { data: row, error } = await supabase.from("workspace_scim_users").update({
          ...(active !== undefined ? { active } : {}), updated_at: new Date().toISOString(),
        }).eq("owner_id", ownerId).eq("id", params.id).select("*").maybeSingle();
        if (error || !row) return Response.json({ detail: "User not found" }, { status: 404 });

        // Deactivation must actually revoke something, not just flip a flag
        // nothing reads. workspace_scim_users had no relationship into
        // team_members: an IdP's standard offboarding call
        // ({"Operations":[{"op":"replace","path":"active","value":false}]})
        // updated this roster row and returned 200, while the deprovisioned
        // person kept full access to every team this workspace owner runs —
        // their auth session, project access, and team credit pool were
        // completely untouched. Best-effort on purpose: SCIM is a directory
        // sync signal, not the caller's only path to revoke access, so a
        // failure here must not turn an otherwise-successful deactivation
        // into a 5xx the IdP will retry forever.
        if (active === false && row.email) {
          await revokeTeamAccessForEmail(supabase, ownerId, String(row.email).toLowerCase()).catch((err) => {
            console.error("SCIM deactivate: failed to revoke team access", err);
          });
        }

        return Response.json(scimUserResource(row));
      },
      GET: async ({ request, params }) => {
        const ownerId = await authenticateScim(request);
        if (!ownerId) return Response.json({ detail: "Unauthorized" }, { status: 401 });
        const supabase = createAdminClient();
        const { data: row } = await supabase.from("workspace_scim_users").select("*").eq("owner_id", ownerId).eq("id", params.id).maybeSingle();
        if (!row) return Response.json({ detail: "Not found" }, { status: 404 });
        return Response.json(scimUserResource(row));
      },
    },
  },
});
