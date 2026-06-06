"use client";

/**
 * Member groups section for the People dashboard page.
 *
 * Surfaces /api/member-groups (migration 051): named groups of workspace
 * members the owner uses for batch access control on projects and published
 * apps. CRUD-only here — the per-project access grant lives on a future
 * project-settings surface.
 *
 * Self-contained: needs no props. Reads + writes through the existing API.
 * Mount inside people-page.tsx near the Role legend so the whole "Groups vs
 * roles" picture is in one place.
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Pencil, Users, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface MemberGroup {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  members?: Array<{ count: number }>;
}

interface GroupMember {
  id: string;
  member_id: string;
  added_at: string;
  member: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null;
}

const PRESET_COLORS = [
  "#8b5cf6", "#3b82f6", "#06b6d4", "#10b981",
  "#f59e0b", "#ef4444", "#ec4899", "#64748b",
];

export function MemberGroupsSection() {
  const [groups, setGroups] = useState<MemberGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // Inline-create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  // Per-group expanded state for the members list
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  // Per-group inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/member-groups");
      if (res.ok) {
        const data = await res.json() as { groups: MemberGroup[] };
        setGroups(data.groups ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function loadMembers(groupId: string) {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/member-groups?groupId=${groupId}`);
      if (res.ok) {
        const data = await res.json() as { members: GroupMember[] };
        setMembers(data.members ?? []);
      }
    } finally {
      setLoadingMembers(false);
    }
  }

  async function createGroup() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/member-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed");
      }
      toast({ title: `Group "${newName.trim()}" created` });
      setNewName("");
      setShowCreate(false);
      await load();
    } catch (err) {
      toast({ title: "Couldn't create group", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(groupId: string) {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      const res = await fetch("/api/member-groups", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, name: editName.trim(), color: editColor }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Group updated" });
      await load();
    } catch (err) {
      toast({ title: "Couldn't update", description: err instanceof Error ? err.message : "", variant: "destructive" });
    } finally {
      setEditingId(null);
    }
  }

  async function removeGroup(groupId: string, name: string) {
    if (!confirm(`Delete the "${name}" group? Members keep their direct project access — only group access is removed.`)) return;
    try {
      await fetch(`/api/member-groups?groupId=${groupId}`, { method: "DELETE" });
      toast({ title: "Group deleted" });
      if (expandedId === groupId) setExpandedId(null);
      await load();
    } catch {
      toast({ title: "Couldn't delete", variant: "destructive" });
    }
  }

  async function removeMember(groupId: string, memberId: string) {
    try {
      await fetch("/api/member-groups", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId, memberId, action: "remove" }),
      });
      toast({ title: "Member removed from group" });
      await loadMembers(groupId);
    } catch {
      toast({ title: "Couldn't remove member", variant: "destructive" });
    }
  }

  function startEdit(g: MemberGroup) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditColor(g.color ?? PRESET_COLORS[0]);
  }

  return (
    <div className="p-3 bg-card rounded-xl border border-border space-y-3">
      <div className="flex items-center gap-2">
        <Users size={13} className="text-violet-400" />
        <h3 className="text-xs font-semibold">Member groups</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {groups.length} group{groups.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground -mt-1">
        Organise teammates into groups for batch project access. Groups complement individual roles — they don&apos;t replace them.
      </p>

      {/* Create-new toggle */}
      {!showCreate ? (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-8 text-[11px]"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="w-3 h-3 mr-1" /> New group
        </Button>
      ) : (
        <div className="rounded-lg border border-border p-2 space-y-2 bg-muted/20">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Engineers"
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void createGroup();
              if (e.key === "Escape") setShowCreate(false);
            }}
          />
          <div className="flex items-center gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${newColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                aria-label={`color ${c}`}
              />
            ))}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-[10px] bg-violet-600 hover:bg-violet-500 text-white"
              onClick={() => void createGroup()}
              disabled={creating || !newName.trim()}
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}
            </Button>
          </div>
        </div>
      )}

      {/* Group list */}
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-[10px] text-muted-foreground text-center py-2">No groups yet.</p>
      ) : (
        <div className="space-y-1">
          {groups.map((g) => {
            const memberCount = g.members?.[0]?.count ?? 0;
            const isExpanded = expandedId === g.id;
            const isEditing = editingId === g.id;
            return (
              <div key={g.id} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-2.5 py-1.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: g.color ?? PRESET_COLORS[0] }}
                  />
                  {isEditing ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 h-6 text-xs"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveRename(g.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <div className="flex items-center gap-0.5">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => setEditColor(c)}
                            className={`w-3.5 h-3.5 rounded-full border-2 ${editColor === c ? "border-foreground" : "border-transparent"}`}
                            style={{ backgroundColor: c }}
                            aria-label={`color ${c}`}
                          />
                        ))}
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => void saveRename(g.id)}>
                        <Check className="w-3 h-3 text-emerald-400" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingId(null)}>
                        <X className="w-3 h-3 text-muted-foreground" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          const next = isExpanded ? null : g.id;
                          setExpandedId(next);
                          if (next) void loadMembers(next);
                        }}
                        className="flex-1 text-left text-xs font-medium truncate hover:underline"
                      >
                        {g.name}
                      </button>
                      <span className="text-[10px] text-muted-foreground">
                        {memberCount} member{memberCount === 1 ? "" : "s"}
                      </span>
                      <button
                        onClick={() => startEdit(g)}
                        className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void removeGroup(g.id, g.name)}
                        className="p-1 rounded hover:bg-muted/40 text-muted-foreground hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
                {isExpanded && (
                  <div className="border-t border-border bg-muted/10 px-3 py-2">
                    {loadingMembers ? (
                      <div className="flex items-center justify-center py-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                      </div>
                    ) : members.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-1">
                        No members in this group yet. Add members from the People table above.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {members.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 text-[11px]">
                            <div className="w-5 h-5 rounded-full bg-violet-500/20 flex items-center justify-center text-[9px] font-semibold text-violet-300 flex-shrink-0">
                              {(m.member?.full_name ?? m.member?.email ?? "?").slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="truncate">{m.member?.full_name ?? m.member?.email ?? "Unknown"}</p>
                            </div>
                            <button
                              onClick={() => void removeMember(g.id, m.member_id)}
                              className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground hover:text-red-400"
                              title="Remove from group"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
