/**
 * Native project-social server-fns — reimplemented off the worker (pure Supabase).
 * Ports of app/api/projects/[id]/{views,star}/route.ts.
 *
 * Header/IP extraction stays in the route handler (needs the Request); the
 * privacy-safe hashing + DB writes live here.
 */
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

// ── Public view tracking ───────────────────────────────────────────────────
export async function recordProjectView(data: any) {
    const supabase = await createClient();
    const { data: project } = await (supabase as any)
      .from("projects")
      .select("id, is_public")
      .eq("id", data.projectId)
      .single();
    if (!project?.is_public) return { status: "forbidden" as const };

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const salt = process.env.IP_HASH_SALT ?? "lifemarkai-views-salt";
    const ipHash = createHash("sha256").update(data.ip + salt).digest("hex");

    await (supabase as any).from("project_views").insert({
      project_id: data.projectId,
      viewer_id: user?.id ?? null,
      ip_hash: ipHash,
      referrer: data.referrer,
      country_code: data.countryCode,
    });
    return { status: "ok" as const };
}

// ── Community star toggle ───────────────────────────────────────────────────
export async function toggleProjectStar(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("id, is_public, star_count")
      .eq("id", data.projectId)
      .single();
    if (!project) return { status: "not_found" as const };
    if (!project.is_public) return { status: "forbidden" as const };

    const { data: existing } = await (supabase as any)
      .from("community_stars")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("user_id", user.id)
      .single();

    let starred: boolean;
    let newCount: number = project.star_count ?? 0;

    if (existing) {
      await (supabase as any)
        .from("community_stars")
        .delete()
        .eq("project_id", data.projectId)
        .eq("user_id", user.id);
      newCount = Math.max(0, newCount - 1);
      starred = false;
    } else {
      await (supabase as any)
        .from("community_stars")
        .insert({ project_id: data.projectId, user_id: user.id });
      newCount = newCount + 1;
      starred = true;
    }

    await (supabase as any)
      .from("projects")
      .update({ star_count: newCount } as Record<string, unknown>)
      .eq("id", data.projectId);

    return { status: "ok" as const, starred, count: newCount };
}

/** Read current user's star state + public count (no auth required). */
export async function getProjectStar(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("star_count")
      .eq("id", data.projectId)
      .single();
    const count = project?.star_count ?? 0;

    if (!user) return { status: "ok" as const, starred: false, count };

    const { data: existing } = await (supabase as any)
      .from("community_stars")
      .select("id")
      .eq("project_id", data.projectId)
      .eq("user_id", user.id)
      .single();

    return { status: "ok" as const, starred: !!existing, count };
}
