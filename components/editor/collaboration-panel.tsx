"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, Crown, Edit3, Eye, X,
  Copy, Check, Loader2, Mail, Wifi, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/types/database";

interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  activeFile?: string;
  lastSeen: string;
}

interface Collaborator {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  profile: { full_name: string; email: string; avatar_url: string | null };
}

interface YjsCollaborator {
  key: string;
  user: { id: string; name: string; color: string; avatar?: string };
  cursor?: { file: string; line: number; column: number };
}

interface CollaborationPanelProps {
  project: Project;
  currentUserId: string;
  /** Live Yjs collaborators — from useYjsEditor in CodePanel */
  yjsCollaborators?: YjsCollaborator[];
}

const PRESENCE_COLORS = [
  "#7c3aed", "#0e90e8", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#84cc16",
];

const ROLE_ICONS = {
  owner: Crown,
  editor: Edit3,
  viewer: Eye,
};

export function CollaborationPanel({ project, currentUserId, yjsCollaborators = [] }: CollaborationPanelProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("editor");
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inviteLinkRole, setInviteLinkRole] = useState<"viewer" | "editor">("editor");
  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ link: string; expiresAt: string; id: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  const shareLink = `${typeof window !== "undefined" ? window.location.origin : ""}/editor/${project.id}`;

  useEffect(() => {
    loadCollaborators();
    setupPresence();
  }, []);

  async function loadCollaborators() {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("collaborators")
      .select("*, profile:profiles(full_name, email, avatar_url)")
      .eq("project_id", project.id);
    if (data) setCollaborators(data as unknown as Collaborator[]);
    setLoading(false);
  }

  function setupPresence() {
    const channel = supabase.channel(`project:${project.id}:presence`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const users: PresenceUser[] = Object.entries(state).map(([userId, [data]], i) => ({
          id: userId,
          name: (data as Record<string, unknown>).name as string ?? "Anonymous",
          avatar: (data as Record<string, unknown>).avatar as string | undefined,
          color: PRESENCE_COLORS[i % PRESENCE_COLORS.length],
          activeFile: (data as Record<string, unknown>).activeFile as string | undefined,
          lastSeen: new Date().toISOString(),
        }));
        setPresence(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            name: "You",
            online_at: new Date().toISOString(),
          });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }

  async function inviteCollaborator() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch("/api/projects/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, email: inviteEmail, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInviteEmail("");
      toast({ title: "Invitation sent!", description: `${inviteEmail} has been invited.` });
      loadCollaborators();
    } catch (err: unknown) {
      toast({ title: "Failed to invite", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  }

  async function removeCollaborator(collaboratorId: string) {
    const { error } = await (supabase as any).from("collaborators").delete().eq("id", collaboratorId);
    if (!error) {
      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
      toast({ title: "Collaborator removed" });
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function generateInviteLink() {
    setGeneratingLink(true);
    try {
      const res = await fetch("/api/projects/invite/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, role: inviteLinkRole, expiresInDays: 7 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGeneratedLink({ link: data.link as string, expiresAt: data.expires_at as string, id: data.id as string });
    } catch (err: unknown) {
      toast({ title: "Failed to generate link", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    } finally {
      setGeneratingLink(false);
    }
  }

  async function revokeInviteLink(id: string) {
    await fetch(`/api/projects/invite/link?id=${id}`, { method: "DELETE" });
    setGeneratedLink(null);
    toast({ title: "Invite link revoked" });
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Users className="w-4 h-4" />
        <span className="text-sm font-semibold">Collaboration</span>
        {presence.length > 0 && (
          <div className="ml-auto flex items-center gap-1.5">
            <Wifi className="w-3 h-3 text-green-400" />
            <span className="text-xs text-green-400">{presence.length} online</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Live co-editors (Yjs CRDT) */}
        {yjsCollaborators.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
              <Wifi className="w-3 h-3 text-violet-400" />
              Editing Now
              <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-full px-1.5 py-0.5">
                {yjsCollaborators.length} live
              </span>
            </h4>
            <div className="space-y-2">
              {yjsCollaborators.map((collab) => (
                <motion.div
                  key={collab.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-3 p-2 rounded-lg bg-violet-500/5 border border-violet-500/10"
                >
                  <div className="relative">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={collab.user.avatar} />
                      <AvatarFallback style={{ backgroundColor: collab.user.color }} className="text-white text-xs font-bold">
                        {collab.user.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-violet-400 border-2 border-background animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{collab.user.name}</p>
                    {collab.cursor && (
                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {collab.cursor.file.split("/").pop()} · L{collab.cursor.line}:{collab.cursor.column}
                      </p>
                    )}
                  </div>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: collab.user.color }} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Online now (Supabase presence) */}
        {presence.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
              Online Now
            </h4>
            <div className="space-y-2">
              {presence.map((user) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3"
                >
                  <div className="relative">
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback style={{ backgroundColor: user.color }} className="text-white text-xs">
                        {user.name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{user.id === currentUserId ? `${user.name} (you)` : user.name}</p>
                    {user.activeFile && (
                      <p className="text-xs text-muted-foreground truncate font-mono">{user.activeFile}</p>
                    )}
                  </div>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: user.color }} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Invite */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            Invite People
          </h4>
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inviteCollaborator()}
              className="h-9"
            />
            <div className="flex gap-2">
              <div className="flex p-0.5 rounded-lg bg-muted border border-border flex-1">
                {(["editor", "viewer"] as const).map((role) => (
                  <button
                    key={role}
                    onClick={() => setInviteRole(role)}
                    className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                      inviteRole === role ? "bg-background shadow text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {role === "editor" ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {role}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                className="gap-1.5 h-9"
                onClick={inviteCollaborator}
                disabled={inviting || !inviteEmail.trim()}
              >
                {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Invite
              </Button>
            </div>
          </div>
        </div>

        {/* Invite Link — expiring, token-based */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Invite Link</h4>
          <div className="space-y-2">
            {/* Role picker */}
            <div className="flex p-0.5 rounded-lg bg-muted border border-border">
              {(["editor", "viewer"] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => { setInviteLinkRole(role); setGeneratedLink(null); }}
                  className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                    inviteLinkRole === role ? "bg-background shadow text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {role === "editor" ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {role}
                </button>
              ))}
            </div>

            {generatedLink ? (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    value={generatedLink.link}
                    readOnly
                    className="h-8 text-[10px] font-mono text-muted-foreground"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={async () => {
                      await navigator.clipboard.writeText(generatedLink.link);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                  >
                    {copiedLink ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                  <span>Expires {new Date(generatedLink.expiresAt).toLocaleDateString()} · {inviteLinkRole} access</span>
                  <button
                    className="text-destructive hover:underline"
                    onClick={() => void revokeInviteLink(generatedLink.id)}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 gap-2 text-xs"
                onClick={generateInviteLink}
                disabled={generatingLink}
              >
                {generatingLink
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Link2 className="w-3.5 h-3.5" />
                }
                Generate 7-day invite link
              </Button>
            )}
          </div>
        </div>

        {/* Collaborators list */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
            People with Access
          </h4>
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {/* Owner (current user) */}
              <div className="flex items-center gap-3 p-2 rounded-lg">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-gradient-brand text-white text-xs">You</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">You</p>
                  <p className="text-xs text-muted-foreground">Owner</p>
                </div>
                <div className="flex items-center gap-1 text-xs text-yellow-400">
                  <Crown className="w-3 h-3" />
                  Owner
                </div>
              </div>

              {collaborators.map((collab) => {
                const RoleIcon = ROLE_ICONS[collab.role];
                const initials = collab.profile.full_name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "U";
                return (
                  <motion.div
                    key={collab.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-3 p-2 rounded-lg group hover:bg-muted/50"
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={collab.profile.avatar_url ?? undefined} />
                      <AvatarFallback className="bg-muted text-foreground text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{collab.profile.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{collab.profile.email}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground capitalize">
                      <RoleIcon className="w-3 h-3" />
                      {collab.role}
                    </div>
                    {collab.user_id !== currentUserId && (
                      <button
                        onClick={() => removeCollaborator(collab.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.div>
                );
              })}

              {collaborators.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No collaborators yet. Invite someone above.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
