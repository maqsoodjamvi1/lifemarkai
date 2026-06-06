import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  sendWelcomeEmail,
  sendDeploymentEmail,
  sendLowCreditsEmail,
} from "@/lib/email/resend";

// ── GET — fetch notifications + unread count ──────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);
  const unreadOnly = url.searchParams.get("unread") === "true";

  let query = (supabase as any)
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: countData } = await (supabase as any)
    .rpc("get_unread_notification_count", { p_user_id: user.id });

  return NextResponse.json({ notifications: data ?? [], unreadCount: countData ?? 0 });
}

// ── POST — send email notification (existing behavior) ────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { type, payload } = await request.json();

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const email = user.email;
    if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

    switch (type) {
      case "welcome":
        await sendWelcomeEmail(email, profile?.full_name ?? "");
        break;
      case "deployment":
        await sendDeploymentEmail(email, payload.projectName, payload.deployUrl);
        break;
      case "low_credits":
        await sendLowCreditsEmail(email, profile?.credits ?? 0);
        break;
      default:
        return NextResponse.json({ error: "Unknown notification type" }, { status: 400 });
    }

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("Notification error:", error);
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}

// ── PATCH — mark read ─────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { action, ids } = await req.json();

  if (action === "mark_all_read") {
    await (supabase as any).rpc("mark_notifications_read", { p_user_id: user.id });
    return NextResponse.json({ success: true });
  }

  if (action === "mark_read" && Array.isArray(ids)) {
    await (supabase as any).from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .in("id", ids as string[]);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

// ── DELETE — remove notification(s) ──────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    await (supabase as any).from("notifications").delete().eq("id", id).eq("user_id", user.id);
  } else {
    await (supabase as any).from("notifications").delete()
      .eq("user_id", user.id).eq("is_read", true);
  }

  return NextResponse.json({ success: true });
}
