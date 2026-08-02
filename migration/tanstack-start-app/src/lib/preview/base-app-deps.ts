/**
 * Single source of truth for the default generated-app dependency set
 * ("Lovable-parity" stack). Imported by:
 *   - lib/templates/built-in.ts  → every new app's package.json
 *   - lib/sandbox/modal.ts        → pre-baked into the Modal preview image so
 *                                    cold `npm install` is near-instant
 *   - lib/ai/package-allowlist.ts → the pins the model is told to write
 *
 * REACT 19, deliberately. The default framework is TanStack Start, whose client
 * entry calls `hydrateRoot(document, …)` — the whole document, `<html>`
 * downwards. Under React 18 that is unconditionally broken by any browser
 * extension that injects into the page at document_start (MetaMask, Trust
 * Wallet, Phantom, Grammarly, most password managers all do): the extension
 * inserts its inpage `<script>` as the FIRST child of `<html>`, React walks
 * `<html>`'s children expecting `<head>`, finds the script, and throws
 *
 *     Warning: Expected server HTML to contain a matching <head> in <html>
 *     Error: Hydration failed because the initial UI does not match…
 *     …the entire root will switch to client rendering
 *
 * — five to seven console errors on every single page load, in every generated
 * app, for any user with a wallet extension installed. Reproduced in headless
 * Chromium against this exact scaffold: React 18.3.1 → 7 console errors and the
 * injected node destroyed; React 19.2.8 → 0 errors, node preserved.
 *
 * React 19 fixes it structurally, not cosmetically: `html`, `head` and `body`
 * became host singletons, resolved by direct `document.head` lookup instead of
 * positional sibling matching, so whatever precedes `<head>` is irrelevant.
 * TanStack Start's own templates ship React 19 for the same reason.
 *
 * Everything below is therefore pinned to a range whose resolved version
 * declares a React 19 peer. The ten packages marked "R19" were bumped off
 * React-18-only majors — installing them alongside React 19 fails `npm install`
 * outright with ERESOLVE, which surfaces to the user as a dead preview. If you
 * add a package here, check its peerDependencies first.
 */

export const BASE_APP_DEPENDENCIES: Record<string, string> = {
  react: "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^6.28.0", // R19 — 6.26 peers react ^18 only
  "@tanstack/react-query": "^5.59.0",
  "react-hook-form": "^7.53.0",
  "@hookform/resolvers": "^3.9.0",
  zod: "^3.23.8",
  "class-variance-authority": "^0.7.0",
  clsx: "^2.1.1",
  "tailwind-merge": "^2.5.2",
  "tailwindcss-animate": "^1.0.7",
  "lucide-react": "^0.468.0", // R19
  "framer-motion": "^11.15.0", // R19
  sonner: "^1.7.1", // R19
  cmdk: "^1.0.4", // R19
  vaul: "^1.1.2", // R19 — 0.9.x peers react ^18 only
  "embla-carousel-react": "^8.5.1", // R19
  "input-otp": "^1.4.1", // R19
  "react-day-picker": "^9.4.0", // R19 — v8 peers react ^18 only
  "date-fns": "^3.6.0",
  "react-resizable-panels": "^2.1.7", // R19
  "next-themes": "^0.4.4", // R19 — 0.3.x peers react ^18 only
  recharts: "^2.15.0", // R19
  "@radix-ui/react-accordion": "^1.2.1",
  "@radix-ui/react-alert-dialog": "^1.1.2",
  "@radix-ui/react-avatar": "^1.1.1",
  "@radix-ui/react-checkbox": "^1.1.2",
  "@radix-ui/react-dialog": "^1.1.2",
  "@radix-ui/react-dropdown-menu": "^2.1.2",
  "@radix-ui/react-label": "^2.1.0",
  "@radix-ui/react-popover": "^1.1.2",
  "@radix-ui/react-scroll-area": "^1.2.0",
  "@radix-ui/react-select": "^2.1.2",
  "@radix-ui/react-separator": "^1.1.0",
  "@radix-ui/react-slot": "^1.1.0",
  "@radix-ui/react-switch": "^1.1.1",
  "@radix-ui/react-tabs": "^1.1.1",
  "@radix-ui/react-toast": "^1.2.2",
  "@radix-ui/react-tooltip": "^1.1.3",
};

export const BASE_APP_DEV_DEPENDENCIES: Record<string, string> = {
  "@types/react": "^19.0.0",
  "@types/react-dom": "^19.0.0",
  "@vitejs/plugin-react": "^4.3.0",
  typescript: "^5.5.0",
  vite: "^5.4.0",
  tailwindcss: "^3.4.0",
  autoprefixer: "^10.4.0",
  postcss: "^8.4.0",
};
