// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTeamInviteEmail } from "@/lib/email/resend";

// POST — invite member to team
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Must be owner or admin
  const { data: myMembership } = await (supabase as any)
    .from("team_members")
    .select("role")
    .eq("team_id", id)
    .eq("user_id", user.id)
    .single();

  if (!myMembership || !["owner","admin"].includes(myMembership.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const { email, role = "member", credit_allowance } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { data: team } = await (supabase as any).from("teams").select("name, max_members").eq("id", id).single();

  // Check member count limit
  const { count } = await (supabase as any)
    .from("team_members")
    .select("id", { count: "exact" })
    .eq("team_id", id)
    .not("accepted_at", "is", null);

  if ((count ?? 0) >= (team?.max_members ?? 10)) {
    return NextResponse.json({ error: "Team member limit reached" }, { status: 400 });
  }

  // Find existing user by email
  const { data: invitedProfile } = await (supabase as any)
    .from("profiles")
    .select("id, full_name, email")
    .eq("email", email)
    .maybeSingle();

  let memberId: string | null = null;

  if (invitedProfile) {
    // User exists — add to team (pending acceptance)
    const { data: member, error } = await (supabase as any)
      .from("team_members")
      .upsert({
        team_id: id,
        user_id: invitedProfile.id,
        role,
        credit_allowance: credit_allowance ?? null,
        invited_by: user.id,
        invited_email: email,
        accepted_at: null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    memberId = member.id;
  } else {
    // User doesn't exist — store invite; user_id set to inviter as placeholder
    const { data: member } = await (supabase as any)
      .from("team_members")
      .insert({
        team_id: id,
        user_id: user.id,   // placeholder; replaced when they accept
        role,
        credit_allowance: credit_allowance ?? null,
        invited_by: user.id,
        invited_email: email,
        accepted_at: null,
      })
      .select()
      .single();
    memberId = member?.id ?? null;
  }

  // Fetch inviter profile for email
  const { data: inviterProfile } = await (supabase as any)
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?teamId=${id}&memberId=${memberId}`;
  const inviterName = inviterProfile?.full_name ?? inviterProfile?.email ?? "Someone";

  try {
    await sendTeamInviteEmail(email, inviterName, team?.name ?? "the team", role, acceptUrl);
  } catch {
    // Email failed — don't block the response
  }

  return NextResponse.json({ ok: true, memberId });
}

// PATCH — update member role or allowance
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberId, role, credit_allowance } = await req.json();
  const updates: Record<string, unknown> = {};
  if (role !== undefined) updates.role = role;
  if (credit_allowance !== undefined) updates.credit_allowance = credit_allowance;

  const { data, error } = await (supabase as any)
    .from("team_members")
    .update(updates)
    .eq("id", memberId)
    .eq("team_id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ member: data });
}

// DELETE — remove member
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const { error } = await (supabase as any)
    .from("team_members")
    .delete()
    .eq("id", memberId)
    .eq("team_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
