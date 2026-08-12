"use client";

/**
 * Toaster — Sonner renderer with Lovable-parity styling on the OKLCH token
 * layer. Theme follows the app's `.dark` class via a MutationObserver so it
 * works whether or not a next-themes provider is mounted.
 */

import { useEffect,useState } from "react";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setTheme(el.classList.contains("dark") ? "dark" : "light");
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-[var(--radius-4)] border-[color:var(--border-default)] bg-[var(--bg-primary-pulse)] text-[var(--fg-primary)] shadow-[0_4px_12px_rgba(0,0,0,0.1)]",
          description: "text-[var(--fg-tertiary)]",
          actionButton: "bg-[var(--bg-accent)] text-[var(--fg-emphasis)]",
          cancelButton: "bg-[var(--bg-muted)] text-[var(--fg-primary)]",
          closeButton:
            "bg-[var(--bg-primary-pulse)] border-[color:var(--border-default)] text-[var(--fg-primary)]",
        },
      }}
    />
  );
}
