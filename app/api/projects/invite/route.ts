import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendCollaborationInviteEmail } from "@/lib/email/resend";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId, email, role = "viewer" } = await request.json();

    if (!projectId || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Check if the current user owns the project or is an admin collaborator
    const { data: project } = await (supabase as any)
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isOwner = project.user_id === user.id;

    if (!isOwner) {
      // Check if user is admin collaborator
      const { data: collab } = await (supabase as any)
        .from("collaborators")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .single();

      if (!collab || collab.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Find the user by email
    const { data: invitedProfile } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("email", email)
      .single();

    if (!invitedProfile) {
      // Send email invitation to non-registered user
      const { data: inviterProfile } = await (supabase as any)
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();

      const { data: projectData } = await (supabase as any)
        .from("projects")
        .select("name")
        .eq("id", projectId)
        .single();

      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/signup?invite=${projectId}&email=${encodeURIComponent(email)}`;

      try {
        await sendCollaborationInviteEmail(
          email,
          inviterProfile?.full_name ?? "Someone",
          projectData?.name ?? "a project",
          role,
          inviteUrl
        );
      } catch (e) {
        console.error("Failed to send invite email:", e);
      }

      return NextResponse.json({
        status: "pending",
        message: `Invitation sent to ${email}. They will be added when they sign up.`,
      });
    }

    // Check if already a collaborator
    const { data: existingCollab } = await (supabase as any)
      .from("collaborators")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", invitedProfile.id)
      .single();

    if (existingCollab) {
      return NextResponse.json({ error: "User is already a collaborator" }, { status: 409 });
    }

    // Don't invite the owner
    if (invitedProfile.id === project.user_id) {
      return NextResponse.json({ error: "Cannot invite the project owner" }, { status: 400 });
    }

    // Add collaborator
    const { data: newCollab, error: collabError } = await (supabase as any)
      .from("collaborators")
      .insert({
        project_id: projectId,
        user_id: invitedProfile.id,
        role,
      })
      .select()
      .single();

    if (collabError) {
      return NextResponse.json({ error: collabError.message }, { status: 500 });
    }

    // Send email to the newly added collaborator
    const { data: inviterProfile } = await (supabase as any)
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const { data: projectData } = await (supabase as any)
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .single();

    const { data: invitedUser } = await supabase.auth.admin.getUserById(invitedProfile.id);
    const invitedEmail = invitedUser?.user?.email;

    if (invitedEmail) {
      try {
        await sendCollaborationInviteEmail(
          invitedEmail,
          inviterProfile?.full_name ?? "Someone",
          projectData?.name ?? "a project",
          role,
          `${process.env.NEXT_PUBLIC_APP_URL}/editor/${projectId}`
        );
      } catch (e) {
        console.error("Failed to send invite email:", e);
      }
    }

    return NextResponse.json({
      collaborator: {
        ...newCollab,
        profile: invitedProfile,
      },
    });
  } catch (error) {
    console.error("Invite error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const collaboratorId = searchParams.get("collaboratorId");

    if (!projectId || !collaboratorId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // Check ownership
    const { data: project } = await (supabase as any)
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await (supabase as any)
      .from("collaborators")
      .delete()
      .eq("id", collaboratorId)
      .eq("project_id", projectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove collaborator error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
