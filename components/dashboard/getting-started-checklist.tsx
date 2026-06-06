"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Circle, Rocket, MessageSquare, Share2, Sparkles, X } from "lucide-react";

interface GettingStartedChecklistProps {
  hasProjects: boolean;
  hasDeployment?: boolean;
  hasShared?: boolean;
}

const DISMISS_KEY = "lm-checklist-dismissed";

const STEPS = [
  {
    id: "create",
    icon: Sparkles,
    title: "Create your first project",
    description: "Use the prompt box above to describe your app idea.",
  },
  {
    id: "build",
    icon: MessageSquare,
    title: "Describe what to build",
    description: "Chat with AI in the editor to generate your app.",
  },
  {
    id: "deploy",
    icon: Rocket,
    title: "Deploy your app",
    description: "Click Publish in the editor to go live instantly.",
  },
  {
    id: "share",
    icon: Share2,
    title: "Share the link",
    description: "Copy your public URL and show the world what you built.",
  },
];

export function GettingStartedChecklist({
  hasProjects,
  hasDeployment = false,
  hasShared = false,
}: GettingStartedChecklistProps) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      setDismissed(!!localStorage.getItem(DISMISS_KEY));
    }
  }, []);

  if (!mounted || dismissed || hasProjects) return null;

  function getChecked(id: string) {
    if (id === "create") return hasProjects;
    if (id === "build")  return hasProjects;
    if (id === "deploy") return hasDeployment;
    if (id === "share")  return hasShared;
    return false;
  }

  const completedCount = STEPS.filter((s) => getChecked(s.id)).length;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 12 }}
        transition={{ duration: 0.3 }}
        className="relative rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/5 via-purple-500/5 to-transparent p-5"
      >
        {/* Dismiss */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold">Get started with LifemarkAI</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {completedCount === 0
              ? "Complete these steps to launch your first app."
              : `${completedCount} of ${STEPS.length} steps done — keep going!`}
          </p>
          {/* Progress bar */}
          <div className="mt-2.5 h-1 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${(completedCount / STEPS.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {STEPS.map((step, idx) => {
            const checked = getChecked(step.id);
            const Icon = step.icon;
            return (
              <div key={step.id} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {checked ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/30" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${checked ? "line-through text-muted-foreground/50" : "text-foreground"}`}>
                      {idx + 1}. {step.title}
                    </span>
                  </div>
                  {!checked && (
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">{step.description}</p>
                  )}
                </div>
                <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${checked ? "text-emerald-400/50" : "text-muted-foreground/30"}`} />
              </div>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
