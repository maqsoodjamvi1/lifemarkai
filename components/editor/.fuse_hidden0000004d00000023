"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Brain, Save, Loader2, Info, Globe, FileText,
  ChevronDown, ChevronUp, Sparkles, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";
import type { Project, Profile } from "@/types/database";

interface KnowledgePanelProps {
  project: Project;
  profile: Profile | null;
  onProjectUpdate: (updated: Partial<Project>) => void;
}

const MAX_CHARS = 10000;

const EXAMPLE_KNOWLEDGE = `## Project Context
This is a SaaS dashboard for managing subscription billing.

## Tech Decisions
- Use shadcn/ui components everywhere — never custom CSS
- All API calls go through /api/* routes, never call Supabase directly from client
- Authentication is handled via Supabase Auth

## Style Guide
- Color scheme: violet primary, dark background (#0a0a0f)
- Always use Framer Motion for animations
- Cards should have border-white/[0.08] and bg-white/[0.03]

## Do Not Change
- The sidebar layout and navigation structure
- The existing database schema`;

export function KnowledgePanel({ project, profile, onProjectUpdate }: KnowledgePanelProps) {
  const [projectKnowledge, setProjectKnowledge] = useState(project.knowledge ?? "");
  const [workspaceKnowledge, setWorkspaceKnowledge] = useState(profile?.workspace_knowledge ?? "");
  const [savingProject, setSavingProject] = useState(false);
  const [savingWorkspace, setSavingWorkspace] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [activeTab, setActiveTab] = useState<"project" | "workspace">("project");
  const { toast } = useToast();
  const supabase = createClient();

  async function generateFromProject() {
    const proceed = !projectKnowledge.trim()
      || window.confirm("This will replace your current Knowledge with an AI-generated draft based on the current project. Continue?");
    if (!proceed) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/generate-knowledge`, { method: "POST" });
      const data = await res.json() as { knowledge?: string; error?: string };
      if (!res.ok || !data.knowledge) {
        toast({ title: "Generation failed", description: data.error ?? "Try again.", variant: "destructive" });
        return;
      }
      setProjectKnowledge(data.knowledge);
      toast({
        title: "Knowledge drafted",
        description: "Review the draft, edit anything that's off, then click Save.",
      });
    } catch (err) {
      toast({ title: "Generation failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    setProjectKnowledge(project.knowledge ?? "");
  }, [project.knowledge]);

  useEffect(() => {
    setWorkspaceKnowledge(profile?.workspace_knowledge ?? "");
  }, [profile?.workspace_knowledge]);

  async function saveProjectKnowledge() {
    setSavingProject(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge: projectKnowledge }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onProjectUpdate({ knowledge: projectKnowledge });
      toast({ title: "Project knowledge saved", description: "AI will use this context in future messages." });
    } catch {
      toast({ title: "Error saving knowledge", variant: "destructive" });
    } finally {
      setSavingProject(false);
    }
  }

  async function saveWorkspaceKnowledge() {
    setSavingWorkspace(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ workspace_knowledge: workspaceKnowledge })
        .eq("id", profile?.id ?? "");
      if (error) throw error;
      toast({ title: "Workspace knowledge saved", description: "Applied to all your projects." });
    } catch {
      toast({ title: "Error saving workspace knowledge", variant: "destructive" });
    } finally {
      setSavingWorkspace(false);
    }
  }

  const projectChars = projectKnowledge.length;
  const workspaceChars = workspaceKnowledge.length;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-white">Knowledge</span>
        </div>
        <p className="text-xs text-slate-500">
          Teach the AI about your project. Context is injected into every prompt.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/[0.06]">
        {(["project", "workspace"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              activeTab === tab
                ? "text-violet-400 border-b-2 border-violet-500"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {tab === "project" ? (
              <span className="flex items-center justify-center gap-1.5">
                <FileText className="w-3 h-3" /> Project
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <Globe className="w-3 h-3" /> Workspace
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {activeTab === "project" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-start gap-2 p-3 rounded-lg bg-violet-500/[0.08] border border-violet-500/20">
              <Info className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Write anything the AI should always know about <strong className="text-white">{project.name}</strong> — architecture decisions, style rules, tech constraints, and what NOT to change.
              </p>
            </div>

            {/* Generate from current project — Lovable best-practice #1 */}
            <Button
              onClick={generateFromProject}
              disabled={generating}
              variant="outline"
              className="w-full border-violet-500/30 bg-violet-500/[0.06] text-violet-300 hover:bg-violet-500/10 hover:text-violet-200 text-xs h-8 gap-1.5"
              title="Read the current project files and draft a Knowledge document"
            >
              {generating ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Drafting from project files…</>
              ) : (
                <><Wand2 className="w-3 h-3" /> Generate from current project</>
              )}
            </Button>

            <Textarea
              value={projectKnowledge}
              onChange={(e) => setProjectKnowledge(e.target.value.slice(0, MAX_CHARS))}
              placeholder={`Describe your project context...\n\nExamples:\n• Tech stack decisions\n• Design system rules\n• What not to modify\n• Business logic constraints`}
              className="min-h-[280px] text-xs font-mono bg-white/[0.03] border-white/[0.08] text-slate-200 placeholder:text-slate-600 resize-none leading-relaxed"
            />

            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowExample(!showExample)}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                {showExample ? "Hide" : "Show"} example
                {showExample ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              <span className={`text-xs ${projectChars > MAX_CHARS * 0.9 ? "text-amber-400" : "text-slate-600"}`}>
                {projectChars.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>

            {showExample && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="rounded-lg bg-white/[0.02] border border-white/[0.06] overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                  <span className="text-xs text-slate-500 font-medium">Example knowledge</span>
                  <button
                    onClick={() => { setProjectKnowledge(EXAMPLE_KNOWLEDGE); setShowExample(false); }}
                    className="text-xs text-violet-400 hover:text-violet-300"
                  >
                    Use this →
                  </button>
                </div>
                <pre className="px-3 py-3 text-xs text-slate-400 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                  {EXAMPLE_KNOWLEDGE}
                </pre>
              </motion.div>
            )}

            <Button
              onClick={saveProjectKnowledge}
              disabled={savingProject || projectKnowledge === (project.knowledge ?? "")}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs h-8"
            >
              {savingProject ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-3 h-3 mr-1.5" /> Save Project Knowledge</>
              )}
            </Button>
          </motion.div>
        )}

        {activeTab === "workspace" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/[0.08] border border-blue-500/20">
              <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400 leading-relaxed">
                Workspace knowledge applies to <strong className="text-white">all your projects</strong>. Use it for global coding standards, preferred libraries, and company-wide conventions.
              </p>
            </div>

            <Textarea
              value={workspaceKnowledge}
              onChange={(e) => setWorkspaceKnowledge(e.target.value.slice(0, MAX_CHARS))}
              placeholder={`Global rules for all projects...\n\nExamples:\n• Always use TypeScript strict mode\n• Prefer shadcn/ui over custom components\n• Company name: Acme Inc\n• Never use inline styles`}
              className="min-h-[280px] text-xs font-mono bg-white/[0.03] border-white/[0.08] text-slate-200 placeholder:text-slate-600 resize-none leading-relaxed"
            />

            <div className="flex justify-end">
              <span className={`text-xs ${workspaceChars > MAX_CHARS * 0.9 ? "text-amber-400" : "text-slate-600"}`}>
                {workspaceChars.toLocaleString()} / {MAX_CHARS.toLocaleString()}
              </span>
            </div>

            <Button
              onClick={saveWorkspaceKnowledge}
              disabled={savingWorkspace || workspaceKnowledge === (profile?.workspace_knowledge ?? "")}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs h-8"
            >
              {savingWorkspace ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-3 h-3 mr-1.5" /> Save Workspace Knowledge</>
              )}
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
