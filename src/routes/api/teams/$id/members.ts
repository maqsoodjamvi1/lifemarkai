import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient,createClient } from "@/lib/supabase/server";
import { sendTeamInviteEmail } from "@/lib/email/resend";
import type { Database } from "@/types/database";

/** Native /api/teams/:id/members — POST invite, PATCH update, DELETE remove. */
export const Route = createFileRoute("/api/teams/$id/members")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const id = params.id;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const admin = createAdminClient();

        const { data: myMembership } = await admin.from("team_members").select("role, accepted_at").eq("team_id", id).eq("user_id", user.id).single();
        if (!myMembership || !myMembership.accepted_at || !["owner", "admin"].includes(myMembership.role)) {
          return Response.json({ error: "Insufficient permissions" }, { status: 403 });
        }

        const { email: rawEmail, role = "member", credit_allowance } = await request.json().catch(() => ({}));
        const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
        if (!email || email.length > 320 || !/^\S+@\S+\.\S+$/.test(email)) return Response.json({ error: "Valid email required" }, { status: 400 });
        if (!["admin", "member", "viewer"].includes(role)) return Response.json({ error: "Invalid team role" }, { status: 400 });
        if (credit_allowance != null && (!Number.isInteger(credit_allowance) || credit_allowance < 0)) {
          return Response.json({ error: "credit_allowance must be a non-negative integer" }, { status: 400 });
        }

        const { data: team } = await admin.from("teams").select("name, max_members").eq("id", id).single();
        const { count } = await admin.from("team_members").select("id", { count: "exact" }).eq("team_id", id).not("accepted_at", "is", null);
        if ((count ?? 0) >= (team?.max_members ?? 10)) return Response.json({ error: "Team member limit reached" }, { status: 400 });

        const { data: invitedProfile } = await admin.from("profiles").select("id, full_name, email").eq("email", email).maybeSingle();
        let memberId: string | null = null;
        if (invitedProfile) {
          const { data: member, error } = await admin.from("team_members").upsert({
            team_id: id, user_id: invitedProfile.id, role, credit_allowance: credit_allowance ?? null, invited_by: user.id, invited_email: email, accepted_at: null,
          }).select().single();
          if (error) return Response.json({ error: error.message }, { status: 400 });
          memberId = member.id;
        } else {
          const { data: member, error } = await admin.from("team_members").insert({
            team_id: id, user_id: null, role, credit_allowance: credit_allowance ?? null, invited_by: user.id, invited_email: email, accepted_at: null,
          }).select().single();
          if (error) return Response.json({ error: error.message }, { status: 400 });
          memberId = member?.id ?? null;
        }

        const { data: inviterProfile } = await admin.from("profiles").select("full_name, email").eq("id", user.id).single();
        const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?teamId=${id}&memberId=${memberId}`;
        const inviterName = inviterProfile?.full_name ?? inviterProfile?.email ?? "Someone";
        try { await sendTeamInviteEmail(email, inviterName, team?.name ?? "the team", role, acceptUrl); } catch { /* non-blocking */ }
        return Response.json({ ok: true, memberId });
      },
      PATCH: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const { memberId, role, credit_allowance } = await request.json().catch(() => ({}));
        if (typeof memberId !== "string" || !memberId) {
          return Response.json({ error: "memberId required" }, { status: 400 });
        }
        const updates: Database["public"]["Tables"]["team_members"]["Update"] = {};
        if (role !== undefined) updates.role = role;
        if (credit_allowance !== undefined) updates.credit_allowance = credit_allowance;

        // role/credit_allowance changes are an owner/admin-only action — a
        // plain member may never grant themself (or anyone else) a higher
        // role or a bigger allowance. This mirrors migration 187's
        // team_member_self_update_guard trigger, which enforces the same
        // rule at the database layer regardless of this route; checking it
        // here too means the caller gets a clear 403 instead of a raw
        // Postgres error.
        if (updates.role !== undefined || updates.credit_allowance !== undefined) {
          const admin = createAdminClient();
          const { data: myMembership } = await admin
            .from("team_members")
            .select("role, accepted_at")
            .eq("team_id", params.id)
            .eq("user_id", user.id)
            .single();
          if (!myMembership || !myMembership.accepted_at || !["owner", "admin"].includes(myMembership.role)) {
            return Response.json({ error: "Only a team owner or admin can change role or credit_allowance" }, { status: 403 });
          }
        }

        const { data, error } = await supabase.from("team_members").update(updates).eq("id", memberId).eq("team_id", params.id).select().single();
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ member: data });
      },
      DELETE: async ({ request, params }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const memberId = new URL(request.url).searchParams.get("memberId");
        if (!memberId) return Response.json({ error: "memberId required" }, { status: 400 });

        // Removing a member is an owner/admin-only action, same reasoning
        // as PATCH above — team_members_owner_admin's RLS policy already
        // enforces this for the target row, but a caller with no
        // membership row at all (never invited to this team) would
        // otherwise get a generic RLS "0 rows affected" instead of a clear
        // 403, and self-removal (leaving a team) has no policy support at
        // all today, so an explicit check here is the honest behavior.
        const admin = createAdminClient();
        const { data: myMembership } = await admin
          .from("team_members")
          .select("role, accepted_at")
          .eq("team_id", params.id)
          .eq("user_id", user.id)
          .single();
        if (!myMembership || !myMembership.accepted_at || !["owner", "admin"].includes(myMembership.role)) {
          return Response.json({ error: "Only a team owner or admin can remove a member" }, { status: 403 });
        }

        const { error } = await supabase.from("team_members").delete().eq("id", memberId).eq("team_id", params.id);
        if (error) return Response.json({ error: error.message }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
