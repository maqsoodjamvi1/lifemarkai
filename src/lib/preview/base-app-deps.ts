/**
 * Single source of truth for the default generated-app dependency set
 * ("Lovable-parity" stack). Imported by:
 *   - lib/templates/built-in.ts  → every new app's package.json
 *   - lib/sandbox/modal.ts        → pre-baked into the Modal preview image so
 *                                    cold `npm install` is near-instant
 *
 * React-19 stack (matches the platform and the sandbox warm image, which was
 * already baking React 19 — this file lagging on 18 meant every preview's
 * "delta reconcile" install downgraded React per project). Keep these two in
 * sync — a version bump here flows to both the scaffold and the baked image
 * automatically; run `npm run sandbox:base-pkg` and rebuild the warm image
 * after changing versions here.
 *
 * React-19 peer notes (installs run WITHOUT --legacy-peer-deps, so peers must
 * genuinely allow 19): react-day-picker needed v9 (v8 peers stop at 18),
 * next-themes needed 0.4.x, vaul needed 1.x. Everything else on a caret
 * resolves to a release that already declares a React 19 peer.
 */

export const BASE_APP_DEPENDENCIES: Record<string, string> = {
  react: "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^6.26.2",
  "@tanstack/react-query": "^5.59.0",
  "react-hook-form": "^7.53.0",
  "@hookform/resolvers": "^3.9.0",
  zod: "^3.23.8",
  "class-variance-authority": "^0.7.0",
  clsx: "^2.1.1",
  "tailwind-merge": "^2.5.2",
  "tailwindcss-animate": "^1.0.7",
  "lucide-react": "^0.446.0",
  "framer-motion": "^11.5.4",
  sonner: "^1.5.0",
  cmdk: "^1.0.0",
  vaul: "^1.1.2",
  "embla-carousel-react": "^8.3.0",
  "input-otp": "^1.2.4",
  "react-day-picker": "^9.14.0",
  "date-fns": "^3.6.0",
  "react-resizable-panels": "^2.1.4",
  "next-themes": "^0.4.6",
  recharts: "^2.12.7",
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
  "@types/react": "^19.2.0",
  "@types/react-dom": "^19.2.0",
  "@vitejs/plugin-react": "^4.3.0",
  typescript: "^5.5.0",
  vite: "^5.4.0",
  tailwindcss: "^3.4.0",
  autoprefixer: "^10.4.0",
  postcss: "^8.4.0",
  // Tailwind plugins the model routinely registers in tailwind.config without
  // adding the package (observed live: `require("@tailwindcss/typography")` →
  // postcss failed to load the config → every stylesheet 500 → blank preview).
  // Shipping them in the scaffold means that config edit just works.
  "@tailwindcss/typography": "^0.5.15",
  "@tailwindcss/forms": "^0.5.9",
};
