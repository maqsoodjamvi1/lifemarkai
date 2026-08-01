/** Native member-groups — reimplemented off the worker (pure Supabase). */
import { createClient } from "@/lib/supabase/server";

export async function listGroupsOrMembers(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    if (data.groupId) {
      const { data: members } = await (supabase as any)
        .from("member_group_members")
        .select(
          `id, member_id, added_at, member:profiles!member_group_members_member_id_fkey ( id, full_name, avatar_url, email )`,
        )
        .eq("group_id", data.groupId);
      return { status: "members" as const, members: members ?? [] };
    }

    const { data: groups } = await (supabase as any)
      .from("member_groups")
      .select(`id, name, description, color, created_at, members:member_group_members ( count )`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    return { status: "groups" as const, groups: groups ?? [] };
}

export async function createGroup(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.name?.trim()) return { status: "bad_request" as const, message: "name required" };

    const { data: row, error } = await (supabase as any)
      .from("member_groups")
      .insert({
        user_id: user.id,
        name: data.name.trim(),
        description: data.description ?? null,
        color: data.color ?? "violet",
      })
      .select()
      .single();
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, group: row };
}

export async function updateGroup(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.groupId) return { status: "bad_request" as const, message: "groupId required" };

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.color !== undefined) updates.color = data.color;

    const { error } = await (supabase as any)
      .from("member_groups")
      .update(updates)
      .eq("id", data.groupId)
      .eq("user_id", user.id);
    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const };
}

export async function setGroupMembership(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.groupId || !data.memberId)
      return { status: "bad_request" as const, message: "groupId and memberId required" };

    const { data: group } = await (supabase as any)
      .from("member_groups")
      .select("id")
      .eq("id", data.groupId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!group) return { status: "not_found" as const };

    if (data.action === "remove") {
      await (supabase as any)
        .from("member_group_members")
        .delete()
        .eq("group_id", data.groupId)
        .eq("member_id", data.memberId);
      return { status: "ok" as const };
    }

    const { error } = await (supabase as any)
      .from("member_group_members")
      .insert({ group_id: data.groupId, member_id: data.memberId });
    if (error && error.code !== "23505") return { status: "error" as const, message: error.message };
    return { status: "ok" as const };
}

export async function deleteGroup(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.groupId) return { status: "bad_request" as const, message: "groupId required" };
    await (supabase as any)
      .from("member_groups")
      .delete()
      .eq("id", data.groupId)
      .eq("user_id", user.id);
    return { status: "ok" as const };
}
