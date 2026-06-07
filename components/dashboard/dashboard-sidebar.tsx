"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Zap, LayoutDashboard, FolderOpen, Settings,
  CreditCard, Users, BookTemplate, LogOut,
  ChevronRight, Plus, Sparkles, BarChart3,
  ClipboardList, Shield, KeyRound, Server, Brain,
  MessageCircle, BookOpen, Inbox, Star, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import type { Profile } from "@/types/database";
import type { User } from "@supabase/supabase-js";

interface DashboardSidebarProps {
  user: User;
  profile: Profile | null;
  recentProjects?: { id: string; name: string; updated_at?: string | null }[];
}

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", shortcut: "" },
  { icon: Inbox, label: "Inbox", href: "/dashboard/inbox", shortcut: "" },
  { icon: FolderOpen, label: "Projects", href: "/dashboard/projects", shortcut: "" },
  { icon: BookTemplate, label: "Templates", href: "/templates", shortcut: "" },
  { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics", shortcut: "" },
  { icon: Users, label: "Team", href: "/dashboard/team", shortcut: "" },
  { icon: CreditCard, label: "Billing", href: "/dashboard/billing", shortcut: "" },
  { icon: Settings, label: "Settings", href: "/dashboard/settings", shortcut: "" },
  { icon: Users, label: "People", href: "/dashboard/people", shortcut: "" },
  { icon: ClipboardList, label: "Audit Logs", href: "/dashboard/audit-logs", shortcut: "" },
  { icon: Shield, label: "Security", href: "/dashboard/security", shortcut: "" },
  { icon: KeyRound, label: "SSO", href: "/dashboard/settings/sso", shortcut: "" },
  { icon: Server, label: "SCIM", href: "/dashboard/settings/scim", shortcut: "" },
  { icon: Brain, label: "Workspace AI", href: "/dashboard/settings/workspace-knowledge", shortcut: "" },
  { icon: Zap, label: "Skills", href: "/dashboard/settings/skills", shortcut: "" },
];

const planColors: Record<string, string> = {
  free:       "text-slate-400 bg-slate-400/10",
  pro:        "text-violet-400 bg-violet-400/10",
  team:       "text-blue-400 bg-blue-400/10",
  business:   "text-blue-400 bg-blue-400/10",   // legacy alias
  enterprise: "text-amber-400 bg-yellow-400/10",
};

// Monthly credit limits per plan (mirrors lib/stripe/plans.ts)
const PLAN_CREDIT_LIMITS: Record<string, number> = {
  free:       50,
  pro:        500,
  team:       2000,
  business:   2000,   // legacy alias
  enterprise: 10000,
};

export function DashboardSidebar({ user, profile, recentProjects = [] }: DashboardSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const initials = (profile?.full_name ?? user.email ?? "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  // ⌘N / Ctrl+N → new project
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        router.push("/dashboard?new=true");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const creditLimit   = PLAN_CREDIT_LIMITS[profile?.plan ?? "free"] ?? 50;
  const creditPercent = profile
    ? Math.min(100, (profile.credits / creditLimit) * 100)
    : 0;

  return (
    <aside className="w-60 flex flex-col border-r border-border bg-sidebar h-full">
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold flex-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-brand flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          LifemarkAI
        </Link>
        <NotificationBell userId={user.id} />
      </div>

      {/* New Project */}
      <div className="px-3 py-3 border-b border-border">
        <Button
          className="w-full h-9 gap-2 bg-gradient-brand text-white hover:opacity-90"
          onClick={() => router.push("/dashboard?new=true")}
          size="sm"
          title="New Project (⌘N)"
        >
          <Plus className="w-4 h-4" />
          New Project
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.slice(0, 1).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <item.icon className={`w-4 h-4 ${active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
            </Link>
          );
        })}

        {/* Recents — Lovable-style sidebar rail */}
        {recentProjects.length > 0 && (
          <div className="pt-3 pb-1">
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recents
            </p>
            {recentProjects.slice(0, 8).map((p) => (
              <Link
                key={p.id}
                href={`/editor/${p.id}`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground truncate"
                title={p.name}
              >
                <History className="w-3 h-3 shrink-0 opacity-60" />
                <span className="truncate">{p.name}</span>
              </Link>
            ))}
          </div>
        )}

        <div className="pt-2 pb-1">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Projects
          </p>
          <Link
            href="/dashboard/projects"
            className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              pathname === "/dashboard/projects"
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" /> All projects
          </Link>
          <Link
            href="/dashboard?tab=starred"
            className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
          >
            <Star className="w-3.5 h-3.5" /> Starred
          </Link>
        </div>

        {navItems.slice(1).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
            >
              <item.icon className={`w-4 h-4 ${active ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
              {item.label}
              {active && <ChevronRight className="w-3 h-3 ml-auto opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* Credits */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="w-3.5 h-3.5" />
            Credits
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold">
              {profile?.credits ?? 0}
              <span className="text-muted-foreground font-normal">/{creditLimit}</span>
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${planColors[profile?.plan ?? "free"]}`}>
              {(profile?.plan ?? "free").toUpperCase()}
            </span>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-brand rounded-full transition-all duration-300"
            style={{ width: `${creditPercent}%` }}
          />
        </div>
      </div>

      {/* Community + Docs */}
      <div className="px-3 py-2 border-t border-border space-y-1">
        <a
          href="https://discord.gg/lifemarkai"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-all"
          title="Join the LifemarkAI community"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          Community
          <span className="ml-auto text-[10px] opacity-50">Discord</span>
        </a>
        <Link
          href="/changelog"
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground transition-all"
          title="Docs and changelog"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Docs &amp; updates
        </Link>
      </div>

      {/* User */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-sidebar-accent/50 cursor-pointer group">
          <Avatar className="w-8 h-8">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-gradient-brand text-white text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{profile?.full_name ?? "User"}</div>
            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          </div>
          <button onClick={handleSignOut} className="opacity-0 group-hover:opacity-100 transition-opacity" title="Sign out">
            <LogOut className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        </div>
      </div>
    </aside>
  );
}
