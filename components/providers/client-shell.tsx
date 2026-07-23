"use client";

import { useEffect } from "react";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { Toaster } from "@/components/ui/toaster";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { installAuthNoiseGuard } from "@/lib/supabase/client";
import { getStoredPlatformLocale } from "@/lib/platform-locale";

/** Single client boundary for root layout — keeps app/layout.js lean. */
export function ClientShell({ children }: { children: React.ReactNode }) {
  // Install as early as possible so GoTrue auto-refresh "Failed to fetch"
  // does not open the Next.js Console TypeError overlay.
  useEffect(() => {
    installAuthNoiseGuard();
    document.documentElement.lang = getStoredPlatformLocale();
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      // Lovable dump: <html class="light"> — the editor defaults to LIGHT.
      // Users who already picked a theme keep it (localStorage wins).
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryProvider>
        <ConfirmDialogProvider>
          {children}
          <Toaster />
        </ConfirmDialogProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
