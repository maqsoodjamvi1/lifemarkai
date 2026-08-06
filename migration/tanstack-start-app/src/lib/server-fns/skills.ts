/**
 * Native workspace skills — list / create / update / delete / increment use.
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";

export async function listSkills() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const [userSkills, builtinSkills] = await Promise.all([
    (supabase as any)
      .from("workspace_skills")
      .select("*")
      .eq("user_id", user.id)
      .order("use_count", { ascending: false })
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("builtin_skills")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  return {
    status: "ok" as const,
    custom: userSkills.data ?? [],
    builtin: builtinSkills.data ?? [],
  };
}

export async function createSkill(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const name = data.name.trim();
    const prompt = data.prompt.trim();
    if (!name || !prompt) {
      return { status: "bad_request" as const, error: "name and prompt are required" };
    }

    const { data: row, error } = await (supabase as any)
      .from("workspace_skills")
      .insert({
        user_id: user.id,
        name,
        description: data.description?.trim() ?? null,
        prompt,
        icon: data.icon ?? "⚡",
        tags: data.tags ?? [],
      })
      .select()
      .single();

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, skill: row };
}

export async function patchSkill(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    if (data.incrementUse) {
      const { error: rpcError } = await (supabase as any).rpc("increment_skill_use", {
        skill_id: data.id,
      });
      if (rpcError) {
        console.warn("[skills] increment_skill_use failed:", rpcError.message);
      }
      return { status: "ok" as const, kind: "increment" as const };
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) {
      updates.description = data.description?.trim() ?? null;
    }
    if (data.prompt !== undefined) updates.prompt = data.prompt.trim();
    if (data.icon !== undefined) updates.icon = data.icon;
    if (data.tags !== undefined) updates.tags = data.tags;

    if (Object.keys(updates).length === 0) {
      return { status: "bad_request" as const, error: "Nothing to update" };
    }

    const { data: row, error } = await (supabase as any)
      .from("workspace_skills")
      .update(updates)
      .eq("id", data.id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, kind: "update" as const, skill: row };
}

export async function deleteSkill(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const { error } = await (supabase as any)
      .from("workspace_skills")
      .delete()
      .eq("id", data.id)
      .eq("user_id", user.id);

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, ok: true };
}
