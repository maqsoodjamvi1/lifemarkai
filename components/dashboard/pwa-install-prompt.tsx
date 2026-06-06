"use client";

/**
 * PWA install prompt — surfaces an "Install Lifemark" banner on mobile/desktop
 * when the browser fires beforeinstallprompt. Lets users add Lifemark to their
 * home screen / app dock as a near-native app experience.
 *
 * Dismissed state persists in localStorage so we don't nag.
 */

import { useEffect, useState } from "react";
import { Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "lifemark.pwa.dismissed";
const DISMISS_DAYS = 14;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    function dismissedRecently(): boolean {
      try {
        const at = parseInt(localStorage.getItem(DISMISS_KEY) ?? "0");
        return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
      } catch { return false; }
    }
    if (dismissedRecently()) return;

    // Only show on mobile or once browser fires the install event
    const isMobile = typeof window !== "undefined"
      && /Mobi|Android|iPhone|iPad/i.test(window.navigator.userAgent);
    if (!isMobile) return;

    function handle(e: Event) {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", handle);
    return () => window.removeEventListener("beforeinstallprompt", handle);
  }, []);

  if (!visible) return null;

  async function install() {
    if (!event) return;
    setInstalling(true);
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setInstalling(false);
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  }

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 md:inset-x-auto md:right-4 md:max-w-sm">
      <div className="rounded-xl border border-violet-500/40 bg-gradient-to-br from-violet-500/[0.08] to-purple-500/[0.06] backdrop-blur p-3 shadow-lg flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
          <Smartphone className="w-4 h-4 text-violet-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-violet-100">Install Lifemark</div>
          <p className="text-[11px] text-violet-200/70 leading-snug mt-0.5">
            Add to your home screen for a native-app experience — offline access, push notifications, and faster launches.
          </p>
          <div className="flex gap-1.5 mt-2">
            <Button size="sm" onClick={install} disabled={installing} className="h-7 text-xs bg-violet-600 hover:bg-violet-500">
              <Download className="w-3 h-3 mr-1" />
              {installing ? "Installing…" : "Install"}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss} className="h-7 text-xs text-violet-200/70 hover:text-violet-100">
              Not now
            </Button>
          </div>
        </div>
        <button onClick={dismiss} className="text-violet-200/60 hover:text-violet-100 shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
