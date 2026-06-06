import type { CapacitorConfig } from "@capacitor/cli";

/**
 * LifemarkAI native mobile shell — Capacitor configuration.
 *
 * Phase 1 strategy: the shell is a thin wrapper around the live production
 * web app, NOT a static export.
 *
 *   • In production builds the app loads https://lifemarkai.com directly,
 *     which means iOS/Android always reflect the latest deploy without
 *     re-submitting to the App Store / Play Store.
 *   • In `cap:dev` mode the shell loads http://10.0.2.2:3000 (Android emu)
 *     or http://localhost:3000 (iOS sim) — set via the CAPACITOR_DEV_URL env
 *     var below if you need a different host.
 *
 * Trade-offs:
 *   ✅ API routes (server actions, /api/ai/chat, etc.) keep working — the
 *      shell is just a packaged browser pointing at the live backend.
 *   ✅ No re-submission cadence; users always have the latest UI.
 *   ⚠ Offline support is whatever the web app already does (PWA manifest).
 *   ⚠ App store reviewers will see a "web wrapper" pattern; that's OK now
 *      but a future phase 2 should bundle the UI to satisfy stricter
 *      review tiers.
 */

// Default to the live production app; override via env at build time for
// staging shells or local development.
const PROD_URL = process.env.CAPACITOR_PROD_URL ?? "https://lifemarkai.com";
const DEV_URL = process.env.CAPACITOR_DEV_URL ?? "http://10.0.2.2:3000";

const config: CapacitorConfig = {
  appId: "app.lifemarkai.editor",
  appName: "LifemarkAI",
  // webDir is required by Capacitor even when using a remote server. Keep it
  // pointing at the standard Next build dir so `cap copy` has a no-op target.
  webDir: ".next",
  server: {
    // In dev: load the running Next.js dev server. In prod: load the live site.
    // Capacitor's `server.url` overrides webDir so the shell behaves as a
    // remote-loaded webview.
    url: process.env.NODE_ENV === "production" ? PROD_URL : DEV_URL,
    // Allow mixed-content while developing against http://localhost; tighten
    // before submitting to stores.
    cleartext: process.env.NODE_ENV !== "production",
    // Permit redirects so OAuth callbacks (Stripe, GitHub, Supabase) work.
    allowNavigation: [
      "*.lifemarkai.com",
      "*.lifemarkai.app",
      "*.supabase.co",
      "*.stripe.com",
      "github.com",
      "*.github.com",
      "accounts.google.com",
    ],
  },
  ios: {
    contentInset: "always",
  },
  android: {
    // Keep the default — Capacitor handles the manifest after `cap add android`.
  },
};

export default config;
