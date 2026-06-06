"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, Crown, Shield, Edit3, Eye, Trash2,
  Mail, FolderOpen, Loader2, Zap, Plus, Check, X,
  Send, Settings, BarChart3, ArrowUpRight, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import type { Profile } from "@/types/database";

interface TeamMember {
  id: string;
  role: "owner" | "admin" | "member" | "viewer";
  credits_used: number;
  credit_allowance: number | null;
  accepted_at: string | null;
  invited_email: string | null;
  profiles: { id: string; full_name: string | null; email: string; avatar_url: string | null } | null;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  plan: string;
  credits: number;
  max_members: number;
  owner_id: string;
}

interface TeamProject {
  id: string; name: string; status: string; framework: string | null; deployed_url: string | null;
}

interface TeamPageProps {
  profile: Profile | null;
  personalProjects: Array<{ id: string; name: string; status: string }>;
  teams: Array<{ team: Team; members: TeamMember[]; projects: TeamProject[] }>;
}

const ROLE_META = {
  owner:  { label: "Owner",  icon: Crown,  color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  admin:  { label: "Admin",  icon: Shield, color: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  member: { label: "Member", icon: Edit3,  color: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  viewer: { label: "Viewer", icon: Eye,    color: "bg-slate-500/15 text-slate-400 border-slate-500/20" },
};

export function TeamPage({ profile, personalProjects, teams }: TeamPageProps) {
  const [activeTeamId, setActiveTeamId] = useState<string | null>(teams[0]?.team.id ?? null);
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [showInvite, setShowInvite]     = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);

  // Create team form
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating]       = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail]           = useState("");
  const [inviteRole, setInviteRole]             = useState<"member" | "admin" | "viewer">("member");
  const [inviteAllowance, setInviteAllowance]   = useState("");
  const [inviting, setInviting]                 = useState(false);

  // Transfer form
  const [transferAmount, setTransferAmount] = useState("");
  const [transferNote, setTransferNote]     = useState("");
  const [transferring, setTransferring]     = useState(false);

  // Editing
  const [editingMember, setEditingMember]   = useState<string | null>(null);
  const [newRole, setNewRole]               = useState<string>("");
  const [newAllowance, setNewAllowance]     = useState<string>("");
  const [removing, setRemoving]             = useState<string | null>(null);

  const activeTeamData = useMemo(
    () => teams.find((t) => t.team.id === activeTeamId),
    [teams, activeTeamId]
  );
  const activeTeam    = activeTeamData?.team;
  const activeMembers = activeTeamData?.members ?? [];
  const activeProjects = activeTeamData?.projects ?? [];
  const myMembership  = activeMembers.find((m) => m.profiles?.id === profile?.id);
  const canManage     = myMembership?.role === "owner" || myMembership?.role === "admin";
  const isOwner       = myMembership?.role === "owner";

  const acceptedMembers = activeMembers.filter((m) => m.accepted_at);
  const pendingMembers  = activeMembers.filter((m) => !m.accepted_at);

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName.trim() }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error);
      toast({ title: `✅ Team "${newTeamName}" created!` });
      window.location.reload();
    } catch (e: unknown) {
      toast({ title: (e as Error).message || "Failed to create team", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function inviteMember() {
    if (!inviteEmail || !activeTeamId) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/teams/${activeTeamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          credit_allowance: inviteAllowance ? parseInt(inviteAllowance) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error);
      toast({ title: `Invitation sent to ${inviteEmail}` });
      setShowInvite(false); setInviteEmail(""); setInviteAllowance("");
      window.location.reload();
    } catch (e: unknown) {
      toast({ title: (e as Error).message || "Invite failed", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  async function topUpPool() {
    const amount = parseInt(transferAmount);
    if (!amount || !activeTeamId) return;
    setTransferring(true);
    try {
      const res = await fetch(`/api/teams/${activeTeamId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, note: transferNote }),
      });
      if (!res.ok) throw new Error((await res.json() as { error?: string }).error);
      toast({ title: `✅ ${amount} credits added to team pool!` });
      setShowTransfer(false); setTransferAmount(""); setTransferNote("");
      window.location.reload();
    } catch (e: unknown) {
      toast({ title: (e as Error).message || "Transfer failed", variant: "destructive" });
    } finally {
      setTransferring(false);
    }
  }

  async function updateMember(memberId: string, role?: string, allowance?: string) {
    if (!activeTeamId) return;
    const res = await fetch(`/api/teams/${activeTeamId}/members`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId,
        role: role || undefined,
        credit_allowance: allowance !== undefined ? (allowance === "" ? null : parseInt(allowance)) : undefined,
      }),
    });
    if (!res.ok) { toast({ title: "Update failed", variant: "destructive" }); return; }
    toast({ title: "Member updated" });
    setEditingMember(null);
    window.location.reload();
  }

  async function removeMember(memberId: string) {
    if (!activeTeamId) return;
    setRemoving(memberId);
    const res = await fetch(`/api/teams/${activeTeamId}/members?memberId=${memberId}`, { method: "DELETE" });
    if (!res.ok) { toast({ title: "Remove failed", variant: "destructive" }); setRemoving(null); return; }
    toast({ title: "Member removed" });
    window.location.reload();
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#0a0a0f]">
      {/* Sidebar — team list */}
      <div className="w-64 border-r border-white/[0.06] flex flex-col shrink-0 overflow-y-auto">
        <div className="p-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Workspaces</h2>
          <p className="text-xs text-slate-500 mt-0.5">{teams.length} team{teams.length !== 1 ? "s" : ""}</p>
        </div>

        <div className="flex-1 p-2 space-y-1">
          {/* Personal */}
          <button
            onClick={() => setActiveTeamId(null)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
              activeTeamId === null ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
            }`}
          >
            <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-violet-400">{profile?.full_name?.[0] ?? "P"}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Personal</p>
              <p className="text-xs text-slate-500">{personalProjects.length} projects</p>
            </div>
          </button>

          {teams.map(({ team, members }) => (
            <button
              key={team.id}
              onClick={() => setActiveTeamId(team.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                activeTeamId === team.id ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-indigo-400">{team.name[0]}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{team.name}</p>
                <p className="text-xs text-slate-500">{members.filter(m => m.accepted_at).length}/{team.max_members} members</p>
              </div>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => setShowCreateTeam(true)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all text-sm"
          >
            <Plus className="w-4 h-4" /> New Team
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {activeTeamId === null ? (
          /* Personal workspace */
          <div className="p-8 space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Personal Workspace</h1>
              <p className="text-slate-400 text-sm mt-1">{personalProjects.length} projects · {profile?.credits ?? 0} credits</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {personalProjects.map((p) => (
                <div key={p.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.1] transition-all">
                  <div className="flex items-center gap-3 mb-2">
                    <FolderOpen className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium text-white truncate">{p.name}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === "deployed" ? "bg-emerald-500/15 text-emerald-400" :
                    p.status === "building" ? "bg-amber-500/15 text-amber-400" :
                    "bg-slate-500/15 text-slate-400"
                  }`}>{p.status}</span>
                </div>
              ))}
              {personalProjects.length === 0 && (
                <div className="col-span-3 text-center py-12 text-slate-500">
                  <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No projects yet. Start building!</p>
                </div>
              )}
            </div>
          </div>
        ) : activeTeam ? (
          <div className="p-8 space-y-6">
            {/* Team header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">{activeTeam.name}</h1>
                <p className="text-slate-400 text-sm mt-1">
                  {acceptedMembers.length}/{activeTeam.max_members} members · {activeTeam.plan} plan
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowTransfer(true)}
                      className="border-white/10 text-slate-300 hover:text-white gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" /> Top Up Pool
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => setShowInvite(true)}
                      className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 border-0 gap-1.5 shadow-lg shadow-violet-500/25"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Invite Member
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Pool Credits", value: activeTeam.credits.toLocaleString(), icon: Zap, color: "from-violet-600/20 to-indigo-600/10 border-violet-500/20", iconColor: "text-violet-400" },
                { label: "Members", value: `${acceptedMembers.length}/${activeTeam.max_members}`, icon: Users, color: "from-indigo-600/20 to-blue-600/10 border-indigo-500/20", iconColor: "text-indigo-400" },
                { label: "Projects", value: activeProjects.length, icon: FolderOpen, color: "from-emerald-600/20 to-teal-600/10 border-emerald-500/20", iconColor: "text-emerald-400" },
                { label: "My Role", value: ROLE_META[myMembership?.role ?? "viewer"].label, icon: Crown, color: "from-amber-600/20 to-orange-600/10 border-amber-500/20", iconColor: "text-amber-400" },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                  className={`p-4 rounded-2xl bg-gradient-to-br border ${s.color}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <s.icon className={`w-4 h-4 ${s.iconColor}`} />
                    <span className="text-xs text-slate-400">{s.label}</span>
                  </div>
                  <p className="text-xl font-bold text-white">{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Credit usage by member */}
            <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-400" /> Credit Usage by Member
              </h3>
              <div className="space-y-3">
                {acceptedMembers.sort((a, b) => b.credits_used - a.credits_used).map((m) => {
                  const name = m.profiles?.full_name ?? m.profiles?.email ?? m.invited_email ?? "Unknown";
                  const max = m.credit_allowance ?? activeTeam.credits;
                  const pct = max > 0 ? Math.min(100, (m.credits_used / max) * 100) : 0;
                  const meta = ROLE_META[m.role];
                  return (
                    <div key={m.id} className="flex items-center gap-3">
                      <Avatar className="w-7 h-7 shrink-0">
                        <AvatarImage src={m.profiles?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-white/[0.06]">{name[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-slate-300 truncate">{name}</span>
                          <span className="text-xs text-slate-500 shrink-0 ml-2">
                            {m.credits_used}{m.credit_allowance ? ` / ${m.credit_allowance}` : ""} cr
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-violet-600 to-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${meta.color}`}>{meta.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Members list */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white">Members ({acceptedMembers.length})</h3>
                {pendingMembers.length > 0 && (
                  <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    {pendingMembers.length} pending
                  </span>
                )}
              </div>

              <div className="divide-y divide-white/[0.04]">
                {acceptedMembers.map((member) => {
                  const name = member.profiles?.full_name ?? member.profiles?.email ?? "Unknown";
                  const meta = ROLE_META[member.role];
                  const isMe = member.profiles?.id === profile?.id;
                  const editing = editingMember === member.id;

                  return (
                    <div key={member.id} className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-8 h-8 shrink-0">
                          <AvatarImage src={member.profiles?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs bg-white/[0.06]">{name[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white truncate">{name}</p>
                            {isMe && <span className="text-xs text-slate-500">(you)</span>}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{member.profiles?.email}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${meta.color}`}>
                            <meta.icon className="w-2.5 h-2.5" /> {meta.label}
                          </span>
                          {member.credit_allowance !== null && (
                            <span className="text-xs text-slate-500 hidden sm:block">{member.credit_allowance} cr limit</span>
                          )}
                          {canManage && !isMe && member.role !== "owner" && (
                            <div className="flex items-center gap-1">
                              <button onClick={() => {
                                setEditingMember(member.id);
                                setNewRole(member.role);
                                setNewAllowance(member.credit_allowance?.toString() ?? "");
                              }} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all">
                                <Settings className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => removeMember(member.id)} disabled={removing === member.id}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                {removing === member.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Inline edit row */}
                      <AnimatePresence>
                        {editing && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 flex items-center gap-2 overflow-hidden"
                          >
                            <select value={newRole} onChange={(e) => setNewRole(e.target.value)}
                              className="text-xs bg-white/[0.06] border border-white/[0.1] text-white rounded-lg px-2 py-1.5 focus:outline-none focus:border-violet-500/50">
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <Input placeholder="Credit limit (blank = unlimited)" value={newAllowance}
                              onChange={(e) => setNewAllowance(e.target.value)} type="number"
                              className="h-7 text-xs bg-white/[0.04] border-white/[0.08] text-white w-44" />
                            <button onClick={() => updateMember(member.id, newRole, newAllowance)}
                              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setEditingMember(null)}
                              className="p-1.5 rounded-lg bg-white/[0.06] text-slate-400 hover:text-white transition-all">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Pending invites */}
                {pendingMembers.map((m) => (
                  <div key={m.id} className="px-5 py-3 flex items-center gap-3 opacity-60">
                    <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-300 truncate">{m.invited_email}</p>
                      <p className="text-xs text-slate-500">Invitation pending</p>
                    </div>
                    <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">Pending</span>
                    {canManage && (
                      <button onClick={() => removeMember(m.id)} className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {acceptedMembers.length === 0 && pendingMembers.length === 0 && (
                  <div className="text-center py-8 text-slate-500 text-sm">
                    No members yet. Invite someone to get started.
                  </div>
                )}
              </div>
            </div>

            {/* Team projects */}
            {activeProjects.length > 0 && (
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                <div className="px-5 py-3 border-b border-white/[0.06]">
                  <h3 className="text-sm font-semibold text-white">Team Projects ({activeProjects.length})</h3>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {activeProjects.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                      <FolderOpen className="w-4 h-4 text-slate-400 shrink-0" />
                      <p className="flex-1 text-sm text-white truncate">{p.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        p.status === "deployed" ? "bg-emerald-500/15 text-emerald-400" :
                        "bg-slate-500/15 text-slate-400"
                      }`}>{p.status}</span>
                      {p.deployed_url && (
                        <a href={p.deployed_url} target="_blank" rel="noopener noreferrer"
                          className="text-slate-500 hover:text-white transition-colors">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {/* Create team */}
        {showCreateTeam && (
          <Modal title="Create a Team" onClose={() => setShowCreateTeam(false)}>
            <p className="text-sm text-slate-400 mb-4">Teams give you a shared credit pool and collaborative workspace.</p>
            <Input placeholder="Team name (e.g. Acme Corp)" value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTeam()}
              className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500 mb-4" />
            <button onClick={createTeam} disabled={creating || !newTeamName.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Create Team</>}
            </button>
          </Modal>
        )}

        {/* Invite member */}
        {showInvite && (
          <Modal title="Invite a Team Member" onClose={() => setShowInvite(false)}>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email address</label>
                <Input placeholder="colleague@company.com" type="email" value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50">
                  <option value="viewer">Viewer — read only</option>
                  <option value="member">Member — can edit projects</option>
                  <option value="admin">Admin — can manage team</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Monthly credit allowance (optional)</label>
                <Input placeholder="e.g. 200 — leave blank for unlimited" type="number" value={inviteAllowance}
                  onChange={(e) => setInviteAllowance(e.target.value)}
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500" />
                <p className="text-xs text-slate-500 mt-1">Limits how many team pool credits this member can use per month.</p>
              </div>
              <button onClick={inviteMember} disabled={inviting || !inviteEmail}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send Invitation</>}
              </button>
            </div>
          </Modal>
        )}

        {/* Top up pool */}
        {showTransfer && (
          <Modal title={`Top Up "${activeTeam?.name}" Pool`} onClose={() => setShowTransfer(false)}>
            <p className="text-sm text-slate-400 mb-4">Transfer from your personal balance to the team&apos;s shared pool.</p>
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-between mb-4">
              <span className="text-sm text-slate-300">Your balance</span>
              <span className="text-sm font-bold text-violet-400">{profile?.credits ?? 0} credits</span>
            </div>
            <div className="space-y-3">
              <Input placeholder="Amount to transfer" type="number" min={1} max={profile?.credits ?? 0}
                value={transferAmount} onChange={(e) => setTransferAmount(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500" />
              <Input placeholder="Note (optional)" value={transferNote} onChange={(e) => setTransferNote(e.target.value)}
                className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-500" />
              <button onClick={topUpPool} disabled={transferring || !transferAmount}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                {transferring ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Zap className="w-4 h-4" /> Top Up Pool</>}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative z-10 w-full max-w-md rounded-2xl bg-[#0f0f1a] border border-white/[0.08] shadow-2xl p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
