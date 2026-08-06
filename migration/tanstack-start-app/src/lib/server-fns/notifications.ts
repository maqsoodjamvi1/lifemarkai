/**
 * Native notifications inbox (GET / PATCH / DELETE).
 * POST email-send stays proxied to Next (Resend).
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";

export async function listNotifications(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const limit = data.limit ?? 30;
    let query = (supabase as any)
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (data.unreadOnly) query = query.eq("is_read", false);

    const { data: rows, error } = await query;
    if (error) return { status: "error" as const, message: error.message };

    const { data: countData } = await (supabase as any).rpc(
      "get_unread_notification_count",
      { p_user_id: user.id },
    );

    return {
      status: "ok" as const,
      notifications: rows ?? [],
      unreadCount: typeof countData === "number" ? countData : 0,
    };
}

export async function markNotifications(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    if (data.action === "mark_all_read") {
      await (supabase as any).rpc("mark_notifications_read", { p_user_id: user.id });
      return { status: "ok" as const, success: true };
    }

    if (data.action === "mark_read" && data.ids?.length) {
      await (supabase as any)
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .in("id", data.ids);
      return { status: "ok" as const, success: true };
    }

    return { status: "error" as const, message: "Invalid action" };
}

export async function deleteNotifications(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    if (data.id) {
      await (supabase as any)
        .from("notifications")
        .delete()
        .eq("id", data.id)
        .eq("user_id", user.id);
    } else {
      await (supabase as any)
        .from("notifications")
        .delete()
        .eq("user_id", user.id)
        .eq("is_read", true);
    }
    return { status: "ok" as const, success: true };
}
