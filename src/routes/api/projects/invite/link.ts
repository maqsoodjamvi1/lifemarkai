import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Native /api/projects/invite/link — shareable project invite tokens.
 *   POST   { projectId, role?, maxUses?, expiresInDays? } → { token, link, expiresAt }
 *   GET    ?projectId=<id>  → list active tokens for a project
 *   DELETE ?id=<tokenId>    → revoke a token
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

export const Route = createFileRoute("/api/projects/invite/link")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId, role = "viewer", maxUses, expiresInDays = 7 } =
          (await request.json()) as { projectId: string; role?: string; maxUses?: number; expiresInDays?: number };

        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });
        if (role !== "viewer" && role !== "editor") {
          return Response.json({ error: "role must be viewer or editor" }, { status: 400 });
        }
        if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 10_000)) {
          return Response.json({ error: "maxUses must be an integer between 1 and 10000" }, { status: 400 });
        }
        if (!Number.isFinite(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
          return Response.json({ error: "expiresInDays must be between 1 and 365" }, { status: 400 });
        }

        const admin = createAdminClient();
        const { data: project } = await admin
          .from("projects").select("id, user_id").eq("id", projectId).single();

        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        if (project.user_id !== user.id) {
          return Response.json({ error: "Only the project owner can create invite links" }, { status: 403 });
        }

        const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();

        const { data: tokenRow, error } = await admin
          .from("project_invite_tokens")
          .insert({
            project_id: projectId,
            created_by: user.id,
            role,
            expires_at: expiresAt,
            ...(maxUses != null ? { max_uses: maxUses } : {}),
          })
          .select("id, token, expires_at, role, used_count, max_uses")
          .single();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        const link = `${APP_URL}/invite/${tokenRow.token as string}`;
        return Response.json({ ...tokenRow, link }, { status: 201 });
      },

      GET: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const { data } = await supabase
          .from("project_invite_tokens")
          .select("id, token, role, expires_at, used_count, max_uses, created_at")
          .eq("project_id", projectId)
          .eq("created_by", user.id)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });

        const rows = (data ?? []).map((r: { token: string; [key: string]: unknown }) => ({
          ...r,
          link: `${APP_URL}/invite/${r.token}`,
        }));
        return Response.json(rows);
      },

      DELETE: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const id = new URL(request.url).searchParams.get("id");
        if (!id) return Response.json({ error: "id required" }, { status: 400 });

        await supabase
          .from("project_invite_tokens")
          .delete()
          .eq("id", id)
          .eq("created_by", user.id);

        return Response.json({ ok: true });
      },
    },
  },
});
