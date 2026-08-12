import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
sendWelcomeEmail,
sendDeploymentEmail,
sendLowCreditsEmail,
} from "@/lib/email/resend";

// ── GET — fetch notifications + unread count ──────────────────────────────────
async function handleGET(req: Request) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);
  const unreadOnly = url.searchParams.get("unread") === "true";

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data: countData } = await supabase
    .rpc("get_unread_notification_count", { p_user_id: user.id });

  return Response.json({ notifications: data ?? [], unreadCount: countData ?? 0 });
}

// ── POST — send email notification (existing behavior) ────────────────────────
async function handlePOST(request: Request) {
  try {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { type, payload } = await request.json();

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    const email = user.email;
    if (!email) return Response.json({ error: "No email" }, { status: 400 });

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
        return Response.json({ error: "Unknown notification type" }, { status: 400 });
    }

    return Response.json({ sent: true });
  } catch (error) {
    console.error("Notification error:", error);
    return Response.json({ error: "Failed to send notification" }, { status: 500 });
  }
}

// ── PATCH — mark read ─────────────────────────────────────────────────────────
async function handlePATCH(req: Request) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { action, ids } = await req.json();

  if (action === "mark_all_read") {
    await supabase.rpc("mark_notifications_read", { p_user_id: user.id });
    return Response.json({ success: true });
  }

  if (action === "mark_read" && Array.isArray(ids)) {
    await supabase.from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .in("id", ids as string[]);
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}

// ── DELETE — remove notification(s) ──────────────────────────────────────────
async function handleDELETE(req: Request) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (id) {
    await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id);
  } else {
    await supabase.from("notifications").delete()
      .eq("user_id", user.id).eq("is_read", true);
  }

  return Response.json({ success: true });
}


export const Route = createFileRoute("/api/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
      POST: async ({ request }) => handlePOST(request),
      PATCH: async ({ request }) => handlePATCH(request),
      DELETE: async ({ request }) => handleDELETE(request),
    },
  },
});
