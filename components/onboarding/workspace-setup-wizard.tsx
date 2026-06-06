"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Code2, Github, Layers, Sparkles, Check, ChevronRight,
  ChevronLeft, X, Loader2, Zap, Globe, Server, Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

interface WorkspaceSetupWizardProps {
  onComplete: () => void;
  onSkip?: () => void;
}

type Framework = "nextjs" | "react" | "vue" | "svelte" | "astro" | "remix";
type AIStyle = "concise" | "detailed" | "creative";

const FRAMEWORKS: { id: Framework; label: string; desc: string; icon: string }[] = [
  { id: "nextjs",  label: "Next.js",  desc: "Full-stack React (default)",   icon: "▲" },
  { id: "react",   label: "React",    desc: "Client-side SPA",              icon: "⚛" },
  { id: "vue",     label: "Vue 3",    desc: "Progressive framework",        icon: "🟢" },
  { id: "svelte",  label: "Svelte",   desc: "Compile-time UI",              icon: "🔥" },
  { id: "astro",   label: "Astro",    desc: "Content-first, islands arch",  icon: "🚀" },
  { id: "remix",   label: "Remix",    desc: "Full-stack web standards",     icon: "💿" },
];

const AI_STYLES: { id: AIStyle; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "concise",  label: "Concise",  desc: "Short, focused code — no boilerplate",       icon: Zap },
  { id: "detailed", label: "Detailed", desc: "Verbose with comments and documentation",    icon: Layers },
  { id: "creative", label: "Creative", desc: "Explores multiple approaches and patterns",  icon: Sparkles },
];

interface WizardState {
  workspaceName: string;
  framework: Framework | null;
  aiStyle: AIStyle | null;
  githubConnected: boolean;
  skipGithub: boolean;
}

const STEPS = [
  { id: "workspace",  label: "Workspace" },
  { id: "framework",  label: "Framework" },
  { id: "ai-style",   label: "AI Style" },
  { id: "github",     label: "GitHub" },
  { id: "done",       label: "Done" },
];

export function WorkspaceSetupWizard({ onComplete, onSkip }: WorkspaceSetupWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [checkingGithub, setCheckingGithub] = useState(false);
  const [state, setState] = useState<WizardState>({
    workspaceName: "",
    framework: "nextjs",
    aiStyle: "concise",
    githubConnected: false,
    skipGithub: false,
  });

  // Pre-fill workspace name from profile
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) {
        setState((s) => ({ ...s, workspaceName: user.user_metadata.full_name + "'s Workspace" }));
      } else if (user?.email) {
        setState((s) => ({ ...s, workspaceName: (user.email ?? "").split("@")[0] + "'s Workspace" }));
      }
    });
  }, []);

  // Check if GitHub is already connected
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await (supabase as any).from("profiles").select("github_token").eq("id", user.id).single();
      if ((data as any)?.github_token) {
        setState((s) => ({ ...s, githubConnected: true }));
      }
    });
  }, []);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const canNext = () => {
    if (currentStep.id === "workspace") return state.workspaceName.trim().length >= 2;
    if (currentStep.id === "framework") return state.framework !== null;
    if (currentStep.id === "ai-style") return state.aiStyle !== null;
    return true;
  };

  async function handleConnectGithub() {
    setCheckingGithub(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { scopes: "repo", redirectTo: `${window.location.origin}/dashboard?setup=1` },
      });
      if (error) throw error;
    } catch {
      toast({ title: "Could not connect GitHub", variant: "destructive" });
    } finally {
      setCheckingGithub(false);
    }
  }

  async function handleComplete() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any).from("profiles").update({
          workspace_name: state.workspaceName,
          preferred_framework: state.framework,
          ai_style: state.aiStyle,
          onboarding_complete: true,
          setup_complete: true,
        } as any).eq("id", user.id);
      }
      toast({ title: "Workspace configured!", description: "You're ready to build." });
    } catch { /* silent */ }
    finally { setSaving(false); }
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-500"
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    i < step ? "bg-violet-500 text-white" :
                    i === step ? "bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/40" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i < step ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`w-6 h-px transition-colors ${i < step ? "bg-violet-500/50" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>
            {onSkip && (
              <button onClick={onSkip} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Step content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* STEP 0 — Workspace name */}
              {currentStep.id === "workspace" && (
                <div>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                    <Building2 className="w-5 h-5 text-blue-400" />
                  </div>
                  <h2 className="text-xl font-bold">Name your workspace</h2>
                  <p className="text-sm text-muted-foreground mt-1 mb-5">This appears across your dashboard and shared projects.</p>
                  <Input
                    value={state.workspaceName}
                    onChange={(e) => setState((s) => ({ ...s, workspaceName: e.target.value }))}
                    placeholder="Acme Corp Workspace"
                    className="text-sm"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter" && canNext()) setStep((s) => s + 1); }}
                  />
                  <p className="text-xs text-muted-foreground mt-2">You can change this anytime in settings.</p>
                </div>
              )}

              {/* STEP 1 — Framework preference */}
              {currentStep.id === "framework" && (
                <div>
                  <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center mb-4">
                    <Code2 className="w-5 h-5 text-violet-400" />
                  </div>
                  <h2 className="text-xl font-bold">Default framework</h2>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">Which framework do you reach for first? AI will default to this for new projects.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {FRAMEWORKS.map((fw) => (
                      <button
                        key={fw.id}
                        onClick={() => setState((s) => ({ ...s, framework: fw.id }))}
                        className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                          state.framework === fw.id
                            ? "border-violet-500/50 bg-violet-500/10 ring-1 ring-violet-500/30"
                            : "border-border bg-muted/20 hover:border-border/80"
                        }`}
                      >
                        <span className="text-lg leading-none mt-0.5">{fw.icon}</span>
                        <div>
                          <div className="text-xs font-semibold text-foreground">{fw.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{fw.desc}</div>
                        </div>
                        {state.framework === fw.id && (
                          <Check className="w-3.5 h-3.5 text-violet-400 ml-auto shrink-0 mt-0.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 2 — AI style */}
              {currentStep.id === "ai-style" && (
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h2 className="text-xl font-bold">AI coding style</h2>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">How should the AI write code? This shapes every generation.</p>
                  <div className="space-y-2">
                    {AI_STYLES.map((style) => {
                      const Icon = style.icon;
                      return (
                        <button
                          key={style.id}
                          onClick={() => setState((s) => ({ ...s, aiStyle: style.id }))}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                            state.aiStyle === style.id
                              ? "border-emerald-500/50 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                              : "border-border bg-muted/20 hover:border-border/80"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            state.aiStyle === style.id ? "bg-emerald-500/20" : "bg-muted"
                          }`}>
                            <Icon className={`w-4 h-4 ${state.aiStyle === style.id ? "text-emerald-400" : "text-muted-foreground"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground">{style.label}</div>
                            <div className="text-xs text-muted-foreground">{style.desc}</div>
                          </div>
                          {state.aiStyle === style.id && (
                            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3 — GitHub */}
              {currentStep.id === "github" && (
                <div>
                  <div className="w-10 h-10 rounded-xl bg-slate-500/10 flex items-center justify-center mb-4">
                    <Github className="w-5 h-5 text-slate-300" />
                  </div>
                  <h2 className="text-xl font-bold">Connect GitHub</h2>
                  <p className="text-sm text-muted-foreground mt-1 mb-5">Sync projects to repos, push commits, and create PRs — all from the editor.</p>

                  {state.githubConnected ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">GitHub connected</p>
                        <p className="text-xs text-muted-foreground">Your account is linked and ready to sync.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Button
                        className="w-full gap-2 bg-[#24292e] hover:bg-[#1a1e22] text-white border-0"
                        onClick={handleConnectGithub}
                        disabled={checkingGithub}
                      >
                        {checkingGithub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                        Connect GitHub account
                      </Button>
                      <button
                        onClick={() => setState((s) => ({ ...s, skipGithub: true }))}
                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        Skip for now — I'll connect later
                      </button>
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[
                      { icon: Server, label: "Auto sync", desc: "Push on save" },
                      { icon: Globe, label: "Branch per project", desc: "Isolated workflow" },
                      { icon: Palette, label: "PR creation", desc: "From the editor" },
                    ].map(({ icon: Icon, label, desc }) => (
                      <div key={label} className="p-2.5 rounded-lg border border-border bg-muted/10">
                        <Icon className="w-4 h-4 text-muted-foreground mx-auto mb-1.5" />
                        <p className="text-[10px] font-medium text-foreground">{label}</p>
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 4 — Done */}
              {currentStep.id === "done" && (
                <div className="text-center">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", duration: 0.5 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/20"
                  >
                    <Check className="w-8 h-8 text-white" strokeWidth={3} />
                  </motion.div>
                  <h2 className="text-xl font-bold">You're all set!</h2>
                  <p className="text-sm text-muted-foreground mt-2 mb-6">
                    Your workspace is configured. Time to build something amazing.
                  </p>

                  <div className="rounded-xl border border-border bg-muted/10 p-4 text-left space-y-3">
                    {[
                      { label: "Workspace", value: state.workspaceName },
                      { label: "Default framework", value: FRAMEWORKS.find((f) => f.id === state.framework)?.label ?? "Next.js" },
                      { label: "AI style", value: AI_STYLES.find((s) => s.id === state.aiStyle)?.label ?? "Concise" },
                      { label: "GitHub", value: state.githubConnected ? "Connected ✓" : "Not connected" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <Badge variant="outline" className="text-[10px] h-5 px-2 font-normal">{value}</Badge>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-3 rounded-xl border border-violet-500/20 bg-violet-500/5 text-left">
                    <p className="text-xs text-violet-300 font-medium mb-1">💡 First-time tip</p>
                    <p className="text-xs text-muted-foreground">
                      Try: <span className="font-mono text-foreground/80">"Build a task manager with drag-and-drop boards"</span> — then watch the AI plan, code, and preview it live.
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => s - 1)}
              disabled={step === 0}
              className="gap-1"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>

            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>

            {isLast ? (
              <Button
                size="sm"
                onClick={handleComplete}
                disabled={saving}
                className="gap-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Start building
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext() && currentStep.id !== "github"}
                className="gap-1"
              >
                {currentStep.id === "github" && !state.githubConnected && !state.skipGithub
                  ? "Skip"
                  : "Next"}
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
