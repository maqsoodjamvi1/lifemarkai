"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users, Plus, Search, Shield, Crown, CheckCircle2,
  XCircle, Pencil, Trash2, Loader2, Mail,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";
import { MemberGroupsSection } from "./member-groups-section";

/* ─── Types ─────────────────────────────────────────────── */

interface Collaborator {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profiles: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

/* ─── Constants ─────────────────────────────────────────── */

const ROLES = ["editor", "viewer"] as const;
type RoleKey = typeof ROLES[number];

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  owner:  { label: "Owner",  color: "text-amber-400",  bg: "bg-amber-500/20"  },
  admin:  { label: "Admin",  color: "text-purple-400", bg: "bg-purple-500/20" },
  editor: { label: "Editor", color: "text-blue-400",   bg: "bg-blue-500/20"   },
  viewer: { label: "Viewer", color: "text-muted-foreground", bg: "bg-muted"  },
};

const ROLE_DESCRIPTIONS = [
  { role: "owner",  desc: "Full control · Billing · Delete workspace" },
  { role: "editor", desc: "Create/edit projects · Deploy" },
  { role: "viewer", desc: "View only · Cannot edit" },
];

/* ─── Component ─────────────────────────────────────────── */

export function PeoplePage({ currentUserId }: { currentUserId: string }) {
  const [members, setMembers]         = useState<Collaborator[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState<RoleKey>("editor");
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [sending, setSending]         = useState(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    // Fetch all collaborators across all user's projects
    const { data } = await (supabase as any)
      .from("collaborators")
      .select("id, user_id, role, created_at, profiles:user_id(id, full_name, email, avatar_url)")
      .order("created_at", { ascending: true });
    setMembers((data as Collaborator[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast({ title: "Enter an email address", variant: "destructive" });
      return;
    }
    setSending(true);
    // Call the team invite API
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) throw new Error("Invite failed");
      toast({ title: "Invitation sent", description: `Invite sent to ${inviteEmail}` });
      setInviteEmail("");
      setShowInvite(false);
      fetchMembers();
    } catch {
      toast({ title: "Invite failed", description: "Could not send invitation", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleUpdateRole = async (collaboratorId: string, newRole: string) => {
    const supabase = createClient();
    await (supabase as any)
      .from("collaborators")
      .update({ role: newRole })
      .eq("id", collaboratorId);
    setEditingId(null);
    toast({ title: "Role updated" });
    fetchMembers();
  };

  const handleRemove = async (collaboratorId: string) => {
    const supabase = createClient();
    await (supabase as any)
      .from("collaborators")
      .delete()
      .eq("id", collaboratorId);
    toast({ title: "Member removed" });
    fetchMembers();
  };

  const filtered = members.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.profiles?.full_name?.toLowerCase() ?? "").includes(q) ||
      (m.profiles?.email?.toLowerCase() ?? "").includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">People</h1>
              <p className="text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full pl-9 pr-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 transition"
          >
            <Plus size={13} /> Invite
          </button>
        </div>

        {/* Invite panel */}
        {showInvite && (
          <div className="p-4 bg-card rounded-xl border border-border shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Invite member</h3>
              <button onClick={() => setShowInvite(false)}>
                <XCircle size={14} className="text-muted-foreground hover:text-foreground" />
              </button>
            </div>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              type="email"
              className="w-full text-xs px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r}
                  onClick={() => setInviteRole(r)}
                  className={`flex-1 py-1.5 text-[10px] font-medium rounded-lg border transition ${
                    inviteRole === r
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-muted-foreground border-border"
                  }`}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={handleInvite}
              disabled={sending}
              className="w-full py-2 bg-foreground text-background text-xs font-medium rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {sending ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : <><Mail size={12} /> Send Invitation</>}
            </button>
          </div>
        )}

        {/* Members table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Member</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Role</th>
                <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Status</th>
                <th className="text-right py-2.5 px-4 text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-10 text-center">
                  <Loader2 size={18} className="text-muted-foreground animate-spin mx-auto" />
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">
                  {search ? "No members match your search" : "No collaborators yet. Invite someone to get started."}
                </td></tr>
              ) : filtered.map((m) => {
                const meta  = ROLE_META[m.role] ?? ROLE_META.viewer;
                const isMe  = m.user_id === currentUserId;
                const isEditing = editingId === m.id;
                const name  = m.profiles?.full_name ?? m.profiles?.email?.split("@")[0] ?? "Unknown";
                const email = m.profiles?.email ?? "";
                const initials = name[0]?.toUpperCase() ?? "?";

                return (
                  <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-muted to-muted-foreground/30 flex items-center justify-center text-[10px] font-bold text-foreground flex-shrink-0">
                          {initials}
                        </div>
                        <div>
                          <span className="font-medium text-foreground block">{name}{isMe ? " (you)" : ""}</span>
                          <span className="text-[10px] text-muted-foreground">{email}</span>
                        </div>
                        {m.role === "owner" && <Crown size={11} className="text-amber-400" />}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <div className="flex gap-1">
                          {ROLES.map((r) => (
                            <button
                              key={r}
                              onClick={() => handleUpdateRole(m.id, r)}
                              className={`text-[8px] px-2 py-0.5 rounded-full border transition ${
                                m.role === r
                                  ? "bg-foreground text-background border-foreground"
                                  : "bg-background text-muted-foreground border-border"
                              }`}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} font-medium`}>
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <CheckCircle2 size={9} /> Active
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {m.role !== "owner" && !isMe && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingId(isEditing ? null : m.id)}
                            className="p-1 hover:bg-muted rounded transition text-muted-foreground hover:text-foreground"
                            title="Edit role"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => handleRemove(m.id)}
                            className="p-1 hover:bg-red-500/10 rounded transition text-muted-foreground hover:text-red-400"
                            title="Remove member"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Member groups (migration 051 + /api/member-groups) */}
        <MemberGroupsSection />

        {/* Role legend */}
        <div className="p-3 bg-card rounded-xl border border-border">
          <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Role Permissions</span>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {ROLE_DESCRIPTIONS.map((r) => {
              const meta = ROLE_META[r.role];
              return (
                <div key={r.role} className="flex items-start gap-1.5">
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${meta.bg} ${meta.color} font-medium mt-0.5`}>
                    {meta.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground">{r.desc}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
