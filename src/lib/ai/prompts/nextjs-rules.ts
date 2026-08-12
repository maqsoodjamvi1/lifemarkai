// ─────────────────────────────────────────────────────────────────────────────
// GENERATED-APP CONTENT — NOT PLATFORM CODE.
//
// Every `next/*` specifier in this file lives inside a PROMPT STRING. It is
// instruction text handed to the model when a USER asks LifemarkAI to build a
// Next.js App Router app. The LifemarkAI platform itself is TanStack Start and
// imports nothing from next/*.
//
// This block was split out of system-prompts.ts so that grepping src/ for a
// next-package import specifier, with this prompts/ directory excluded, returns
// zero hits. Any future match is then a REAL platform regression rather than a
// false positive someone has to re-triage. Keep generated-app Next.js prompt
// text here, not in system-prompts.ts.
//
// Consumed by NEXT_APP_GENERATION_SYSTEM_PROMPT (system-prompts.ts), which is
// selected when a project's framework is "next" or "nextjs".
// ─────────────────────────────────────────────────────────────────────────────
export const NEXTJS_RULES = `
## Next.js 14 App Router — SSR-First Generation Rules

### Architecture
- App Router ONLY — NEVER create a pages/ directory, NEVER create index.html, NEVER create vite.config.ts or src/main.tsx. Next.js owns the document via app/layout.tsx.
- Server Components by DEFAULT — add "use client" (as the very first line of the file) ONLY where interactivity requires it: useState/useEffect/useRef, event handlers (onClick, onChange, onSubmit), browser APIs (window, localStorage), or client hooks (useRouter, usePathname, useSearchParams).
- Routing is FILE-BASED: each route is app/<route>/page.tsx (e.g. app/about/page.tsx → /about). Do NOT use react-router-dom — it has no place in a Next.js app. Internal navigation uses <Link href="..."> from "next/link".
- SEO: export const metadata from app/layout.tsx and static pages; export generateMetadata() from dynamic routes — title, description, openGraph.
- Images: use plain <img> tags with the Design System fallback pattern — do NOT use next/image (the in-editor preview cannot run Next's image optimizer; plain <img> renders everywhere).
- Fonts: next/font/google in app/layout.tsx (e.g. Inter) applied via className on <body>.
- Shared components live in components/ at the PROJECT ROOT (not src/). Data, types, and utils live in lib/ (lib/data.ts with MOCK_ seed data, lib/types.ts, lib/utils.ts).
- Imports: relative paths or the @/ alias which maps to the PROJECT ROOT — "@/components/ui/Button", "@/lib/data" (tsconfig paths is "@/*": ["./*"]).
- Prefer synchronous reads from lib/data.ts in Server Components for preview-safe data; wire Supabase (lib/supabase.ts) for persistence-backed builds. Do not fetch from invented external APIs.

### File Structure
\`\`\`
app/
  layout.tsx           # Root layout: <html>, <body>, metadata export, font, imports ./globals.css
  page.tsx             # Home (Server Component) — rich multi-section page
  globals.css          # Tailwind directives + HSL CSS variables
  [route]/
    page.tsx           # Route page (Server Component unless interactive)
    loading.tsx        # Suspense fallback skeleton (optional but encouraged)
    error.tsx          # Error boundary (must be "use client")
    layout.tsx         # Nested layout (optional)
components/
  ui/                  # Shared UI kit — Button, Card, Badge, Input, Table (Server-safe unless interactive)
  layout/              # Navbar.tsx, Footer.tsx, Sidebar.tsx
  [feature]/           # Feature components
lib/
  utils.ts             # cn() helper + formatDate/formatCurrency
  types.ts             # Shared TypeScript types
  data.ts              # ALL MOCK_ seed data in one file — import it everywhere
next.config.mjs        # Next.js config
tailwind.config.ts     # Tailwind config (content: app/, components/, lib/)
postcss.config.mjs     # PostCSS (tailwindcss + autoprefixer)
tsconfig.json          # TypeScript config with "@/*": ["./*"] paths
package.json           # next + react + react-dom; scripts dev/build/start
\`\`\`

### Server vs Client Components — Decision Rules
- Server Component: data fetching, no interactivity, no browser APIs, no React hooks
- Client Component ("use client"): onClick, onChange, useState, useEffect, useRouter, usePathname, useMemo
- Async Server Components: use async/await directly for data — no useEffect needed
- Pass data as props from Server → Client to minimize client bundle

### Data Fetching (Server Components)
\`\`\`tsx
// ✅ Correct — Server Component reading seed data (preview-safe, no useEffect)
import { MOCK_PRODUCTS } from "@/lib/data";
export default function Page() {
  return <ProductGrid products={MOCK_PRODUCTS} />;
}

// ✅ Correct — async Server Component (Supabase-backed builds)
export default async function Page() {
  const items = await getItems(); // lib/ data-access with seed fallback
  return <ItemList items={items} />;
}

// ✅ Correct — dynamic route with error handling (Next.js 14: params is a plain object)
export default async function Page({ params }: { params: { id: string } }) {
  const item = await getItem(params.id);
  if (!item) notFound();
  return <ItemDetail item={item} />;
}
\`\`\`

### SSR SEO Rules (critical)
\`\`\`tsx
// Dynamic pages export generateMetadata (static pages export const metadata):
export async function generateMetadata({ params }: { params: { id: string } }) {
  const item = await getItem(params.id);
  return {
    title: item?.name ?? "Not Found",
    description: item?.description,
    openGraph: { title: item?.name, description: item?.description },
  };
}
\`\`\`

### package.json — REQUIRED structure (scripts dev/build/start are mandatory)
\`\`\`json
{
  "name": "app",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.2.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.11",
    "typescript": "^5.5.3"
  }
}
\`\`\`
Add extra packages to dependencies as needed (they must appear here if imported).

### next.config.mjs (always generate this — .mjs, not .ts)
\`\`\`js
/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;
\`\`\`

### tsconfig.json (always generate this)
\`\`\`json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
\`\`\`

### tailwind.config.ts (always generate this)
\`\`\`ts
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
\`\`\`

### postcss.config.mjs (always generate this)
\`\`\`js
export default {
  plugins: { tailwindcss: {}, autoprefixer: {} },
};
\`\`\`

### app/globals.css (always generate this)
Must begin with the three Tailwind directives, then the same HSL semantic
color tokens the Design System uses for src/index.css in Vite apps (:root
and .dark blocks with --background, --foreground, --primary, --radius, etc.),
hue-adjusted to the inferred accent.

### app/layout.tsx (always generate this — root layout skeleton)
\`\`\`tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "App Name — Tagline",
  description: "One-sentence description for SEO",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
\`\`\`
Add the shared Navbar/Footer (from components/layout/) around {children} for
marketing/storefront apps; use a sidebar shell layout for admin/ERP apps.

### Shared-block path mapping (IMPORTANT)
Wherever the Design System or other shared rules reference Vite paths, map them
to the Next.js equivalents:
- src/components/ui/ → components/ui/
- src/lib/ai.ts → lib/ai.ts (managed AI helper — same import, "@/lib/ai")
- src/lib/supabase.ts → lib/supabase.ts
- src/index.css → app/globals.css
- src/data/<domain>.ts → lib/data.ts
- src/pages/<Page>.tsx → app/<route>/page.tsx
`;
