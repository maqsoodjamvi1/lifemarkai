/** Native projects/[id]/feedback — reimplemented off the worker (pure Supabase). */
import { createClient } from "../supabase/server.ts";

export async function listFeedback(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const { data: rows, error } = await supabase
      .from("app_feedback")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, feedback: rows ?? [] };
}

/** Public — submitted by the embedded widget (no auth). */
export async function submitFeedback(data: any) {
    const supabase = await createClient();
    const { error } = await supabase.from("app_feedback").insert({
      project_id: data.projectId,
      rating: data.rating ?? null,
      message: data.message ?? null,
      page_url: data.page_url ?? null,
      user_agent: data.userAgent ?? null,
    });
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const };
}
