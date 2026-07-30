/**
 * Generated-app scaffold — mirrors a REAL Lovable export, file for file.
 *
 * PROVENANCE: derived from an actual Lovable project export (package name
 * `vite_react_shadcn_ts`), not from inference. Every convention below was read
 * out of that export rather than guessed:
 *
 *   - Vite 5 + React 18 + TypeScript, `@vitejs/plugin-react-swc` (NOT plugin-react)
 *   - routing is `react-router-dom` v6 declared inside src/App.tsx
 *     (<BrowserRouter><Routes><Route>), NOT a file-based router
 *   - pages are `src/pages/<PascalCase>.tsx`; home is `Index.tsx`, catch-all is
 *     `NotFound.tsx` mounted at path="*"
 *   - the `@/` alias IS the house style — `components.json` declares
 *     @/components, @/lib/utils, @/components/ui, @/hooks and every generated
 *     file imports through it. (LifemarkAI's old Vite prompt told the model the
 *     exact opposite: "Do NOT use path aliases". That was wrong.)
 *   - `tailwind.config.ts` — TypeScript, not .js
 *   - shadcn/ui via components.json, style "default", baseColor "slate",
 *     cssVariables true; primitives live in src/components/ui/
 *   - Supabase client at `src/integrations/supabase/client.ts` (NOT
 *     src/lib/supabase.ts) reading VITE_SUPABASE_URL +
 *     VITE_SUPABASE_PUBLISHABLE_KEY, with a sibling generated `types.ts`
 *   - provider nesting in App.tsx: QueryClientProvider > TooltipProvider >
 *     domain contexts > <Toaster /> + <Sonner /> > BrowserRouter > Routes
 *   - split tsconfigs: tsconfig.json (references) + tsconfig.app.json +
 *     tsconfig.node.json, all non-strict
 *   - vite dedupes react/react-dom/jsx-runtime + @tanstack/react-query
 *
 * The PLATFORM (LifemarkAI itself) remains TanStack Start. This is only the
 * shape of the apps the platform GENERATES.
 */
import { BASE_APP_DEPENDENCIES, BASE_APP_DEV_DEPENDENCIES } from "@/lib/preview/base-app-deps";

export interface ScaffoldFile {
  path: string;
  content: string;
  language?: string;
}

/** Deps observed in the real export, merged over the shared base set. */
export const LOVABLE_VITE_DEPENDENCIES: Record<string, string> = {
  ...BASE_APP_DEPENDENCIES,
  react: "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.30.1",
  "@tanstack/react-query": "^5.83.0",
  "@supabase/supabase-js": "^2.104.0",
  "@hookform/resolvers": "^3.10.0",
  "react-hook-form": "^7.61.1",
  zod: "^3.25.76",
  "class-variance-authority": "^0.7.1",
  clsx: "^2.1.1",
  "tailwind-merge": "^2.6.0",
  "tailwindcss-animate": "^1.0.7",
  "lucide-react": "^0.462.0",
  sonner: "^1.7.4",
  cmdk: "^1.1.1",
  vaul: "^0.9.9",
  "next-themes": "^0.3.0",
  "date-fns": "^3.6.0",
  recharts: "^2.15.4",
  "embla-carousel-react": "^8.6.0",
  "input-otp": "^1.4.2",
  "react-day-picker": "^8.10.1",
  "react-resizable-panels": "^2.1.9",
};

export const LOVABLE_VITE_DEV_DEPENDENCIES: Record<string, string> = {
  ...BASE_APP_DEV_DEPENDENCIES,
  vite: "^5.4.19",
  "@vitejs/plugin-react-swc": "^3.11.0",
  typescript: "^5.8.3",
  tailwindcss: "^3.4.17",
  "@tailwindcss/typography": "^0.5.16",
  autoprefixer: "^10.4.21",
  postcss: "^8.5.6",
  "@types/node": "^22.16.5",
  "@types/react": "^18.3.23",
  "@types/react-dom": "^18.3.7",
};

const PACKAGE_JSON = (name: string) =>
  JSON.stringify(
    {
      name: name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "app",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
        "build:dev": "vite build --mode development",
        lint: "eslint .",
        preview: "vite preview",
      },
      dependencies: LOVABLE_VITE_DEPENDENCIES,
      devDependencies: LOVABLE_VITE_DEV_DEPENDENCIES,
    },
    null,
    2,
  );

// host/allowedHosts added on top of Lovable's config so the preview works behind
// the sandbox tunnel; dedupe is Lovable's own and also prevents the dual-React
// "Invalid hook call" class of failure.
const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    host: true,
    allowedHosts: true,
    port: 8080,
    hmr: { overlay: false },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
    ],
  },
}));
`;

const INDEX_HTML = (name: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
    <meta name="description" content="${name}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${name}" />
    <meta property="og:description" content="${name}" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const COMPONENTS_JSON = JSON.stringify(
  {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "default",
    rsc: false,
    tsx: true,
    tailwind: {
      config: "tailwind.config.ts",
      css: "src/index.css",
      baseColor: "slate",
      cssVariables: true,
      prefix: "",
    },
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
  },
  null,
  2,
);

const TSCONFIG = JSON.stringify(
  {
    files: [],
    references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }],
    compilerOptions: {
      paths: { "@/*": ["./src/*"] },
      noImplicitAny: false,
      noUnusedParameters: false,
      skipLibCheck: true,
      allowJs: true,
      noUnusedLocals: false,
      strictNullChecks: false,
    },
  },
  null,
  2,
);

const TSCONFIG_APP = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: "force",
      noEmit: true,
      jsx: "react-jsx",
      strict: false,
      noUnusedLocals: false,
      noUnusedParameters: false,
      noImplicitAny: false,
      noFallthroughCasesInSwitch: false,
      paths: { "@/*": ["./src/*"] },
    },
    include: ["src"],
  },
  null,
  2,
);

const TSCONFIG_NODE = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2023"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: "force",
      noEmit: true,
      strict: false,
    },
    include: ["vite.config.ts"],
  },
  null,
  2,
);

const TAILWIND_CONFIG = `import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
`;

const POSTCSS_CONFIG = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;

const MAIN_TSX = `import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
`;

// Provider nesting copied from the real export. Keep this order.
const APP_TSX = `import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Add all custom routes ABOVE the catch-all "*" route. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
`;

const INDEX_PAGE = (name: string) => `const Index = () => {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">${name}</h1>
        <p className="text-xl text-muted-foreground">
          Start chatting with AI to build your app.
        </p>
      </div>
    </main>
  );
};

export default Index;
`;

const NOT_FOUND_PAGE = `import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
`;

const UTILS_TS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`;

const VITE_ENV_D_TS = `/// <reference types="vite/client" />
`;

// App.tsx imports these two, so they must ship with the scaffold or the very
// first preview dies on a dangling import. Both copied verbatim from the real
// export so the shadcn conventions (lowercase filenames, cn from @/lib/utils,
// forwardRef + displayName) are demonstrated from file one.
const UI_SONNER = `import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
`;

const UI_TOOLTIP = `import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
`;

/**
 * Canonical starter file set for a generated app, matching the Lovable export.
 * shadcn primitives are NOT all pre-installed — the AI adds the ones a build
 * actually uses under src/components/ui/, exactly as Lovable does.
 */
export function lovableViteScaffold(name = "My App"): ScaffoldFile[] {
  return [
    { path: "index.html", language: "html", content: INDEX_HTML(name) },
    { path: "package.json", language: "json", content: PACKAGE_JSON(name) },
    { path: "vite.config.ts", language: "typescript", content: VITE_CONFIG },
    { path: "components.json", language: "json", content: COMPONENTS_JSON },
    { path: "tsconfig.json", language: "json", content: TSCONFIG },
    { path: "tsconfig.app.json", language: "json", content: TSCONFIG_APP },
    { path: "tsconfig.node.json", language: "json", content: TSCONFIG_NODE },
    { path: "tailwind.config.ts", language: "typescript", content: TAILWIND_CONFIG },
    { path: "postcss.config.js", language: "javascript", content: POSTCSS_CONFIG },
    { path: "src/index.css", language: "css", content: INDEX_CSS },
    { path: "src/main.tsx", language: "typescriptreact", content: MAIN_TSX },
    { path: "src/App.tsx", language: "typescriptreact", content: APP_TSX },
    { path: "src/vite-env.d.ts", language: "typescript", content: VITE_ENV_D_TS },
    { path: "src/pages/Index.tsx", language: "typescriptreact", content: INDEX_PAGE(name) },
    { path: "src/pages/NotFound.tsx", language: "typescriptreact", content: NOT_FOUND_PAGE },
    { path: "src/lib/utils.ts", language: "typescript", content: UTILS_TS },
    { path: "src/components/ui/sonner.tsx", language: "typescriptreact", content: UI_SONNER },
    { path: "src/components/ui/tooltip.tsx", language: "typescriptreact", content: UI_TOOLTIP },
  ];
}

/** True when a file set follows the Lovable/Vite shape. */
export function isLovableViteProject(
  files: Array<{ path: string; content?: string | null }>,
): boolean {
  const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")));
  return (
    paths.has("src/App.tsx") &&
    (paths.has("src/main.tsx") || paths.has("index.html"))
  );
}
