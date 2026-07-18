"use client";

import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, X } from "lucide-react";

export interface LovableSecretBannerState {
  key: string;
  label: string;
  ok: boolean;
}

interface LovableComposerSecretBannerProps {
  state: LovableSecretBannerState | null;
  onDismiss: () => void;
  onOpenSecrets?: () => void;
}

/** Inline confirmation when a pasted API key was saved to Secrets (Lovable parity). */
export function LovableComposerSecretBanner({
  state,
  onDismiss,
  onOpenSecrets,
}: LovableComposerSecretBannerProps) {
  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className={`mx-3 mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            state.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/30 bg-amber-500/10 text-amber-200"
          }`}
        >
          <KeyRound className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {state.ok ? (
              <p>
                <span className="font-medium">{state.label}</span> saved as{" "}
                <code className="font-mono text-[10px] bg-black/20 px-1 rounded">{state.key}</code>.
                Your message only carries the tag — the raw key never hits chat history.
              </p>
            ) : (
              <p>
                Secret redacted from your message. Add <code className="font-mono">{state.key}</code> manually in
                Secrets if auto-save failed.
              </p>
            )}
            {onOpenSecrets && (
              <button
                type="button"
                onClick={onOpenSecrets}
                className="mt-1 text-[10px] underline underline-offset-2 opacity-80 hover:opacity-100"
              >
                Open Secrets vault
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
