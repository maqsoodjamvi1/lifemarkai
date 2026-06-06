"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Bot, Code2, Rocket, Github, Database,
  ChevronRight, ChevronLeft, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface OnboardingModalProps {
  onComplete: () => void;
}

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to LifemarkAI",
    subtitle: "Build full-stack apps from a single prompt — in minutes.",
    icon: Zap,
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
    content: (
      <div className="grid grid-cols-2 gap-3 mt-4">
        {[
          { icon: Bot, label: "Agent Mode", desc: "AI works autonomously" },
          { icon: Code2, label: "Monaco Editor", desc: "VS Code in the browser" },
          { icon: Rocket, label: "One-click Deploy", desc: "Live in seconds" },
          { icon: Database, label: "Supabase Built-in", desc: "Database + Auth ready" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="p-3 rounded-xl border border-border bg-muted/30 text-sm">
            <Icon className="h-4 w-4 text-primary mb-1.5" />
            <div className="font-medium">{label}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "modes",
    title: "Four AI Modes",
    subtitle: "Choose the right mode for every task.",
    icon: Bot,
    iconColor: "text-blue-400",
    iconBg: "bg-blue-500/10",
    content: (
      <div className="space-y-3 mt-4">
        {[
          { label: "Chat", emoji: "💬", desc: "Conversational edits — perfect for tweaks and quick changes." },
          { label: "Plan", emoji: "🗺", desc: "AI plans the full architecture before writing a single line." },
          { label: "Build", emoji: "⚡", desc: "Generate entire app features from one detailed prompt." },
          { label: "Agent", emoji: "🤖", desc: "Autonomous loop — reads files, writes code, fixes its own errors." },
        ].map(({ label, emoji, desc }) => (
          <div key={label} className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/30 transition-colors">
            <span className="text-xl">{emoji}</span>
            <div>
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "shortcuts",
    title: "Power User Tips",
    subtitle: "Move fast with these keyboard shortcuts.",
    icon: Code2,
    iconColor: "text-green-400",
    iconBg: "bg-green-500/10",
    content: (
      <div className="space-y-2 mt-4">
        {[
          { keys: ["⌘", "K"], label: "Open command palette" },
          { keys: ["⌘", "S"], label: "Save current file" },
          { keys: ["⌘", "Enter"], label: "Send AI message" },
          { keys: ["⌘", "B"], label: "Toggle file tree" },
          { keys: ["⌘", "⇧", "P"], label: "Switch AI mode to Plan" },
          { keys: ["⌘", "⇧", "A"], label: "Switch to Agent mode" },
        ].map(({ keys, label }) => (
          <div key={label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
            <span className="text-sm text-muted-foreground">{label}</span>
            <div className="flex items-center gap-1">
              {keys.map((k, i) => (
                <kbd key={i} className="px-1.5 py-0.5 text-xs bg-muted border border-border rounded font-mono">{k}</kbd>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "first-project",
    title: "You're all set!",
    subtitle: "Start with a template or build from scratch.",
    icon: Rocket,
    iconColor: "text-orange-400",
    iconBg: "bg-orange-500/10",
    content: (
      <div className="mt-4 space-y-3">
        <div className="p-4 rounded-xl border border-violet-500/30 bg-violet-500/5">
          <p className="text-sm font-medium text-violet-400 mb-1">Try your first prompt:</p>
          <p className="text-xs text-muted-foreground font-mono bg-background/50 p-2 rounded-lg border border-border">
            "Build a SaaS dashboard with a sidebar, stats cards, and a data table"
          </p>
        </div>
        <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5">
          <p className="text-sm font-medium text-blue-400 mb-1">Or start from a template:</p>
          <p className="text-xs text-muted-foreground">Choose from 8 production-ready starters in the Templates gallery.</p>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground">
          <Github className="h-3.5 w-3.5 flex-shrink-0" />
          Connect GitHub in Settings to sync your projects to a repo automatically.
        </div>
      </div>
    ),
  },
];

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  async function handleComplete() {
    // Mark onboarding complete in profile
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await (supabase as any)
          .from("profiles")
          .update({ onboarding_complete: true } as any)
          .eq("id", user.id);
      }
    } catch { /* silent fail */ }
    onComplete();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Progress bar */}
        <div className="h-1 bg-muted">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-500"
            animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <div className="p-6">
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i <= step ? "bg-primary w-6" : "bg-muted w-3"
                  }`}
                />
              ))}
            </div>
            <button
              onClick={handleComplete}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <div className={`w-10 h-10 rounded-xl ${current.iconBg} flex items-center justify-center mb-4`}>
                <current.icon className={`h-5 w-5 ${current.iconColor}`} />
              </div>
              <h2 className="text-xl font-bold">{current.title}</h2>
              <p className="text-sm text-muted-foreground mt-1">{current.subtitle}</p>
              {current.content}
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
              {step + 1} / {STEPS.length}
            </span>

            <Button
              size="sm"
              onClick={isLast ? handleComplete : () => setStep((s) => s + 1)}
              className="gap-1 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700"
            >
              {isLast ? (
                <><Check className="h-4 w-4" /> Get Started</>
              ) : (
                <>Next <ChevronRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
