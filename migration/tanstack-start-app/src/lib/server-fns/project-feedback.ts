/** Native projects/[id]/feedback — reimplemented off the worker (pure Supabase). */
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@/lib/supabase/server";

export const listFeedback = createServerFn({ method: "GET" })
  .validator((d: { projectId: string }) => d)
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const { data: rows, error } = await (supabase as any)
      .from("app_feedback")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, feedback: rows ?? [] };
  });

/** Public — submitted by the embedded widget (no auth). */
export const submitFeedback = createServerFn({ method: "POST" })
  .validator(
    (d: { projectId: string; rating?: number; message?: string; page_url?: string; userAgent?: string }) => d,
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { error } = await (supabase as any).from("app_feedback").insert({
      project_id: data.projectId,
      rating: data.rating ?? null,
      message: data.message ?? null,
      page_url: data.page_url ?? null,
      user_agent: data.userAgent ?? null,
    });
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const };
  });
