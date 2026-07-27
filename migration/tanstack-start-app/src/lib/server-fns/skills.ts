/**
 * Native workspace skills — list / create / update / delete / increment use.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";

export const listSkills = createServerFn({ method: "GET" }).handler(async () => {
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
});

export const createSkill = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        name: z.string().min(1),
        description: z.string().nullable().optional(),
        prompt: z.string().min(1),
        icon: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
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
  });

export const patchSkill = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        id: z.string().uuid(),
        name: z.string().optional(),
        description: z.string().nullable().optional(),
        prompt: z.string().optional(),
        icon: z.string().optional(),
        tags: z.array(z.string()).optional(),
        incrementUse: z.boolean().optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
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
  });

export const deleteSkill = createServerFn({ method: "POST" })
  .validator(zodValidator(z.object({ id: z.string().uuid() })))
  .handler(async ({ data }) => {
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
  });
