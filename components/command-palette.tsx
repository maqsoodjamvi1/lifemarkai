"use client";

import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "cmdk";
import {
  LayoutDashboard, FolderOpen, Settings, CreditCard,
  Users, Moon, Sun, LogOut, Plus, BarChart3,
  BookTemplate, Bot, Github, Rocket, Search, FileCode2,
  Code2, Eye, Columns, History, Zap, Download, BarChart2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";

function CommandShortcut({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto text-xs text-muted-foreground font-mono pl-2 shrink-0">
      {children}
    </span>
  );
}

export interface CommandPaletteFile {
  id: string;
  path: string;
  language?: string;
}

export interface CommandPaletteActions {
  onOpenFile?: (file: CommandPaletteFile) => void;
  onDeploy?: () => void;
  onPushGithub?: () => void;
  onOpenPanel?: (panel: string) => void;
  onSetViewMode?: (mode: "preview" | "code" | "both") => void;
  onToggleFileTree?: () => void;
}

interface CommandPaletteProps {
  projects?: Array<{ id: string; name: string; framework: string }>;
  files?: CommandPaletteFile[];
  actions?: CommandPaletteActions;
}

export function CommandPalette({ projects = [], files = [], actions }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const run = useCallback((fn: () => void) => {
    setOpen(false);
    fn();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  const hasEditor = !!actions;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search files, projects, actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* ── File search (editor only) ─────────────────────────────── */}
        {files.length > 0 && (
          <>
            <CommandGroup heading="Files">
              {files.slice(0, 12).map((f) => {
                const parts = f.path.split("/");
                const name = parts[parts.length - 1];
                const dir  = parts.slice(0, -1).join("/");
                return (
                  <CommandItem
                    key={f.id}
                    value={f.path}
                    onSelect={() => run(() => actions?.onOpenFile?.(f))}
                  >
                    <FileCode2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-mono text-sm">{name}</span>
                    {dir && (
                      <span className="ml-2 text-xs text-muted-foreground font-mono truncate">
                        {dir}
                      </span>
                    )}
                    {f.language && (
                      <span className="ml-auto text-xs text-muted-foreground capitalize pl-2 shrink-0">
                        {f.language.replace("typescriptreact", "tsx").replace("javascriptreact", "jsx")}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ── Editor quick actions ──────────────────────────────────── */}
        {hasEditor && (
          <>
            <CommandGroup heading="Editor">
              <CommandItem onSelect={() => run(() => actions?.onSetViewMode?.("both"))}>
                <Columns className="mr-2 h-4 w-4" />
                Split view
                <CommandShortcut>⌘3</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onSetViewMode?.("code"))}>
                <Code2 className="mr-2 h-4 w-4" />
                Code only
                <CommandShortcut>⌘2</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onSetViewMode?.("preview"))}>
                <Eye className="mr-2 h-4 w-4" />
                Preview only
                <CommandShortcut>⌘1</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onToggleFileTree?.())}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Toggle file tree
                <CommandShortcut>⌘\</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onOpenPanel?.("agent"))}>
                <Bot className="mr-2 h-4 w-4" />
                Open Agent mode
                <CommandShortcut>⌘⇧A</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onDeploy?.())}>
                <Rocket className="mr-2 h-4 w-4" />
                Deploy project
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onPushGithub?.())}>
                <Github className="mr-2 h-4 w-4" />
                Push to GitHub
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onOpenPanel?.("history"))}>
                <History className="mr-2 h-4 w-4" />
                View snapshot history
              </CommandItem>
              <CommandItem onSelect={() => run(() => actions?.onOpenPanel?.("analytics"))}>
                <BarChart2 className="mr-2 h-4 w-4" />
                Project analytics
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ── Navigation ───────────────────────────────────────────── */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => run(() => router.push("/dashboard"))}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/templates"))}>
            <BookTemplate className="mr-2 h-4 w-4" />
            Templates
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/dashboard/analytics"))}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/dashboard/team"))}>
            <Users className="mr-2 h-4 w-4" />
            Team
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/dashboard/billing"))}>
            <CreditCard className="mr-2 h-4 w-4" />
            Billing
          </CommandItem>
          <CommandItem onSelect={() => run(() => router.push("/dashboard/settings"))}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </CommandItem>
        </CommandGroup>

        {/* ── Recent projects ───────────────────────────────────────── */}
        {projects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Recent Projects">
              {projects.slice(0, 6).map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => run(() => router.push(`/editor/${p.id}`))}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {p.name}
                  <span className="ml-auto text-xs text-muted-foreground capitalize">{p.framework}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* ── Global actions ────────────────────────────────────────── */}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(() => router.push("/dashboard?new=true"))}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}>
            {theme === "dark"
              ? <Sun className="mr-2 h-4 w-4" />
              : <Moon className="mr-2 h-4 w-4" />}
            Toggle {theme === "dark" ? "Light" : "Dark"} Mode
          </CommandItem>
          <CommandItem
            onSelect={() => run(handleSignOut)}
            className="text-destructive data-[selected=true]:text-destructive"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

// Trigger button for navbar / header
export function CommandPaletteTrigger() {
  return (
    <button
      onClick={() => {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })
        );
      }}
      className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Search…</span>
      <kbd className="ml-2 text-xs bg-muted px-1.5 py-0.5 rounded border border-border font-mono">⌘K</kbd>
    </button>
  );
}
