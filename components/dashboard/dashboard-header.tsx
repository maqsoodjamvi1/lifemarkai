"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GlobalSearch } from "@/components/dashboard/global-search";
import type { Profile } from "@/types/database";
import type { User } from "@supabase/supabase-js";

interface DashboardHeaderProps {
  user: User;
  profile: Profile | null;
  compact?: boolean;
}

export function DashboardHeader({ user, profile, compact }: DashboardHeaderProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = profile?.full_name?.split(" ")[0] ?? user.email?.split("@")[0] ?? "Builder";
  const router = useRouter();

  const avatarFallback = (profile?.full_name ?? user.email ?? "U")[0].toUpperCase();

  return (
    <div className={`border-b border-border px-6 py-3 flex items-center justify-between gap-4 bg-background/50 backdrop-blur-sm sticky top-0 z-10 ${compact ? "py-2.5" : "py-4"}`}>
      {!compact ? (
        <div>
          <h1 className="text-lg font-semibold">{greeting}, {firstName} 👋</h1>
          <p className="text-sm text-muted-foreground">What are you building today?</p>
        </div>
      ) : (
        <div className="hidden md:block flex-1 max-w-md">
          <GlobalSearch />
        </div>
      )}

      <div className="flex items-center gap-3 ml-auto">
        {!compact && (
          <div className="hidden md:block">
            <GlobalSearch />
          </div>
        )}

        {/* Notifications bell */}
        <Button variant="ghost" size="icon" className="relative h-9 w-9" title="Notifications">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
        </Button>

        {/* Avatar → settings */}
        <Avatar
          className="h-8 w-8 cursor-pointer ring-2 ring-border hover:ring-primary/40 transition-all"
          title="Account settings"
          onClick={() => router.push("/dashboard/settings")}
        >
          <AvatarImage src={profile?.avatar_url ?? ""} alt={firstName} />
          <AvatarFallback className="text-xs font-semibold bg-gradient-to-br from-violet-500 to-blue-500 text-white">
            {avatarFallback}
          </AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}
