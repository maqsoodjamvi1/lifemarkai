// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sendCollaborationInviteEmail } from "@/lib/email/resend";
import { logAuditFromRequest } from "@/lib/audit/log";

/**
 * Native /api/projects/invite — email a single-use collaboration invite (POST)
 * or remove a collaborator (DELETE ?projectId=&collaboratorId=). Owner-only.
 */
const INVITE_ROLES = new Set(["viewer", "editor"]);

export const Route = createFileRoute("/api/projects/invite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

          const body = (await request.json()) as { projectId?: string; email?: string; role?: string };
          const projectId = body.projectId?.trim();
          const email = body.email?.trim().toLowerCase();
          const role = body.role ?? "viewer";
          if (!projectId || !email) return Response.json({ error: "Missing required fields" }, { status: 400 });
          if (email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) {
            return Response.json({ error: "Invalid email address" }, { status: 400 });
          }
          if (!INVITE_ROLES.has(role)) return Response.json({ error: "Role must be viewer or editor" }, { status: 400 });

          const admin = createAdminClient();
          const { data: project, error: projectError } = await (admin as any)
            .from("projects").select("id, user_id, name").eq("id", projectId).maybeSingle();
          if (projectError) throw new Error(projectError.message);
          if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
          if (project.user_id !== user.id) {
            return Response.json({ error: "Only the project owner can invite collaborators" }, { status: 403 });
          }

          const { data: ownerProfile } = await (admin as any)
            .from("profiles").select("email, full_name").eq("id", user.id).maybeSingle();
          if (ownerProfile?.email?.toLowerCase() === email) {
            return Response.json({ error: "Cannot invite the project owner" }, { status: 400 });
          }

          const { data: invite, error: inviteError } = await (admin as any)
            .from("project_invite_tokens")
            .insert({
              project_id: projectId,
              created_by: user.id,
              role,
              max_uses: 1,
              expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            })
            .select("token, expires_at")
            .single();
          if (inviteError || !invite) throw new Error(inviteError?.message ?? "Unable to create invite");

          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
          const inviteUrl = `${appUrl}/invite/${invite.token as string}`;
          try {
            await sendCollaborationInviteEmail(
              email,
              ownerProfile?.full_name ?? "Someone",
              project.name ?? "a project",
              role,
              inviteUrl,
            );
          } catch (error) {
            console.error("Failed to send collaboration invite email:", error);
          }

          void logAuditFromRequest(request, {
            userId: user.id,
            action: "member.invite",
            resourceType: "project",
            resourceId: projectId,
            metadata: { email, role, status: "pending", expiresAt: invite.expires_at },
          });
          return Response.json({
            status: "pending",
            message: `Invitation sent to ${email}.`,
            expiresAt: invite.expires_at,
          });
        } catch (error) {
          console.error("Invite error:", error);
          return Response.json({ error: "Unable to create invitation" }, { status: 500 });
        }
      },

      DELETE: async ({ request }) => {
        try {
          const supabase = await createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

          const sp = new URL(request.url).searchParams;
          const projectId = sp.get("projectId");
          const collaboratorId = sp.get("collaboratorId");
          if (!projectId || !collaboratorId) {
            return Response.json({ error: "Missing required parameters" }, { status: 400 });
          }

          const admin = createAdminClient();
          const { data: project } = await (admin as any)
            .from("projects").select("user_id").eq("id", projectId).maybeSingle();
          if (!project || project.user_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });

          const { error } = await (admin as any)
            .from("collaborators").delete().eq("id", collaboratorId).eq("project_id", projectId);
          if (error) return Response.json({ error: error.message }, { status: 500 });

          void logAuditFromRequest(request, {
            userId: user.id,
            action: "member.remove",
            resourceType: "project",
            resourceId: projectId,
            metadata: { collaboratorId },
          });
          return Response.json({ success: true });
        } catch (error) {
          console.error("Remove collaborator error:", error);
          return Response.json({ error: "Internal server error" }, { status: 500 });
        }
      },
    },
  },
});
