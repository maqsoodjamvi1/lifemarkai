"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";
import { WorkspaceSetupWizard } from "@/components/onboarding/workspace-setup-wizard";
import { CommandPalette } from "@/components/command-palette";
import { WhatsNewModal } from "@/components/dashboard/whats-new-modal";
import { AnimatePresence, motion } from "framer-motion";
import { Zap, X, ShoppingCart } from "lucide-react";

const LOW_CREDITS_THRESHOLD = 5;
const SESSION_KEY = "lm-credits-warned";

interface DashboardClientProps {
  showOnboarding: boolean;
  showSetupWizard?: boolean;
  projects: Array<{ id: string; name: string; framework: string }>;
  credits?: number;
}

export function DashboardClient(
  { showOnboarding, showSetupWizard = false, projects, credits = 0 }: DashboardClientProps
) {
  const router = useRouter();
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [setupWizardDone, setSetupWizardDone] = useState(false);
  const [showCreditToast, setShowCreditToast] = useState(false);

  useEffect(() => {
    if (credits < LOW_CREDITS_THRESHOLD && credits >= 0) {
      const alreadyWarned = sessionStorage.getItem(SESSION_KEY);
      if (!alreadyWarned) {
        setShowCreditToast(true);
      }
    }
  }, [credits]);

  function dismissToast() {
    setShowCreditToast(false);
    sessionStorage.setItem(SESSION_KEY, "1");
  }

  function goToBilling() {
    dismissToast();
    router.push("/billing");
  }

  return (
    <>
      {/* Workspace setup wizard — shown once for new workspaces (before product tour) */}
      {showSetupWizard && !setupWizardDone && (
        <WorkspaceSetupWizard
          onComplete={() => setSetupWizardDone(true)}
          onSkip={() => setSetupWizardDone(true)}
        />
      )}
      {/* Product tour onboarding — shown after setup wizard completes */}
      {showOnboarding && !onboardingDone && (setupWizardDone || !showSetupWizard) && (
        <OnboardingModal onComplete={() => setOnboardingDone(true)} />
      )}
      {/* What's new — shown once per app version */}
      {!showOnboarding && !showSetupWizard && <WhatsNewModal />}
      <CommandPalette projects={projects} />

      <AnimatePresence>
        {showCreditToast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-6 z-50 flex items-center gap-3 max-w-sm bg-amber-950/95 backdrop-blur-sm border border-amber-500/40 rounded-xl px-4 py-3 shadow-2xl"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-200">
                {credits === 0 ? "Out of credits" : String(credits) + " credit" + (credits !== 1 ? "s" : "") + " left"}
              </p>
              <p className="text-xs text-amber-400/80 mt-0.5">Top up to keep building with AI</p>
            </div>
            <button
              onClick={() => setShowCreditToast(false)}
              className="text-amber-400/60 hover:text-amber-400 transition-colors shrink-0 ml-1"
            >
              ✕
            </button>
            <a
              href="/billing"
              className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 text-xs font-semibold transition-colors"
            >
              Top up
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
