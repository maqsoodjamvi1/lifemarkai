/**
 * Native notifications inbox (GET / PATCH / DELETE).
 * POST email-send stays proxied to Next (Resend).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";

export const listNotifications = createServerFn({ method: "GET" })
  .validator(
    zodValidator(
      z
        .object({
          limit: z.coerce.number().int().min(1).max(100).optional(),
          unreadOnly: z.boolean().optional(),
        })
        .catch({}),
    ),
  )
  .handler(async ({ data }) => {
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
  });

export const markNotifications = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        action: z.enum(["mark_all_read", "mark_read"]),
        ids: z.array(z.string().uuid()).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
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
  });

export const deleteNotifications = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        id: z.string().uuid().optional(),
        clearRead: z.boolean().optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
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
  });
