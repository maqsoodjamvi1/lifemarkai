/**
 * Lovable project import adapter.
 *
 * Lovable.dev exports projects via GitHub two-way sync or a codebase ZIP.
 * Those projects are Vite + React + Tailwind (+ shadcn/ui) — directly
 * compatible with LifemarkAI's react framework — but carry Lovable-specific
 * tooling that must be stripped or flagged:
 *
 *  - `lovable-tagger` dev dependency + `componentTagger()` vite plugin
 *    (Lovable's visual-edit instrumentation; useless outside Lovable and the
 *    package install would fail builds if their registry entry disappears)
 *  - the legacy `gptengineer.js` script tag in index.html (older exports)
 *  - `.lovable/` internals (plan.md etc. — editor state, not app code)
 *  - Lovable Cloud backend references (VITE_SUPABASE_* pointing at THEIR
 *    managed project, LOVABLE_API_KEY AI gateway usage) — these keep working
 *    only while the Lovable project exists, so we surface migration notes.
 */

export interface ImportFile {
  path: string;
  content: string;
  language: string;
}

export interface LovableAdaptResult {
  files: ImportFile[];
  /** Human-readable migration notes to show after import. */
  notes: string[];
  /** True when Lovable markers were detected (tagger, .lovable/, gptengineer). */
  isLovable: boolean;
  /** Project name from package.json, if present. */
  packageName: string | null;
}

/** Strip the componentTagger import + plugin usage from a vite config. */
function stripTaggerFromViteConfig(src: string): string {
  return src
    // import { componentTagger } from "lovable-tagger";
    .replace(/import\s*\{[^}]*componentTagger[^}]*\}\s*from\s*["']lovable-tagger["'];?\n?/g, "")
    // mode === 'development' && componentTagger(),  |  componentTagger(),
    .replace(/[^\S\n]*(?:mode\s*===?\s*["']development["']\s*&&\s*)?componentTagger\(\)\s*,?\n?/g, "")
    // .filter(Boolean) safety usage stays harmless either way
    ;
}

/** Remove lovable-tagger from package.json dependencies/devDependencies. */
function stripTaggerFromPackageJson(src: string): { content: string; packageName: string | null; hadTagger: boolean } {
  try {
    const pkg = JSON.parse(src) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    let hadTagger = false;
    for (const key of ["dependencies", "devDependencies"] as const) {
      if (pkg[key] && "lovable-tagger" in pkg[key]!) {
        delete pkg[key]!["lovable-tagger"];
        hadTagger = true;
      }
    }
    return {
      content: JSON.stringify(pkg, null, 2) + "\n",
      packageName: typeof pkg.name === "string" ? pkg.name : null,
      hadTagger,
    };
  } catch {
    return { content: src, packageName: null, hadTagger: false };
  }
}

/** Remove the legacy Lovable/GPT-Engineer select script from index.html. */
function stripGptEngineerScript(src: string): string {
  return src.replace(
    /[^\S\n]*<script[^>]*src=["']https:\/\/cdn\.gpteng\.co\/gptengineer\.js["'][^>]*>\s*<\/script>\n?/gi,
    "",
  );
}

/**
 * Lovable HARDCODES its Cloud project's URL + publishable key into the
 * generated supabase client (src/integrations/supabase/client.ts):
 *
 *   const SUPABASE_URL = "https://xxxx.supabase.co";
 *   const SUPABASE_PUBLISHABLE_KEY = "eyJ...";
 *
 * Left as-is, the imported app stays chained to the Lovable backend forever
 * (and breaks the moment that Lovable project is deleted). Rewrite the
 * literals to env-first with the original value as fallback — the app keeps
 * working against the old backend immediately, and switching to the user's
 * own backend becomes a pure env change (which LifemarkAI's Cloud auto-wire
 * already performs).
 */
function envifySupabaseClient(src: string): { content: string; changed: boolean } {
  let changed = false;
  let out = src.replace(
    /const\s+(SUPABASE_URL)\s*=\s*["'](https:\/\/[^"']+\.supabase\.co)["']/g,
    (_m, name, url) => {
      changed = true;
      return `const ${name} = import.meta.env.VITE_SUPABASE_URL ?? "${url}"`;
    },
  );
  out = out.replace(
    /const\s+(SUPABASE_(?:PUBLISHABLE|ANON)_KEY)\s*=\s*["']([\w.-]+)["']/g,
    (_m, name, key) => {
      changed = true;
      return `const ${name} = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "${key}"`;
    },
  );
  return { content: out, changed };
}

export function adaptLovableProject(input: ImportFile[]): LovableAdaptResult {
  const notes: string[] = [];
  let isLovable = false;
  let packageName: string | null = null;

  // Newer Lovable projects (May 2026+) use TanStack Start with SSR — the
  // files import fine, but the in-editor preview engines target Vite+React
  // SPAs, so warn up front instead of letting the preview mysteriously fail.
  const pkgFile = input.find((f) => f.path === "package.json");
  if (pkgFile && /@tanstack\/(react-)?start/.test(pkgFile.content)) {
    notes.push(
      "This is a newer Lovable project on TanStack Start (SSR). All files were imported, but the live preview targets Vite+React SPAs — expect limited preview support; deploying via GitHub/Vercel will work normally. Ask the AI to \"convert this app to a Vite + React SPA\" if you want full preview support.",
    );
  }

  const files: ImportFile[] = [];
  for (const file of input) {
    // Drop Lovable editor internals — not app code.
    if (file.path === ".lovable" || file.path.startsWith(".lovable/")) {
      isLovable = true;
      continue;
    }

    let content = file.content;

    if (file.path === "package.json") {
      const res = stripTaggerFromPackageJson(content);
      content = res.content;
      packageName = res.packageName;
      if (res.hadTagger) {
        isLovable = true;
        notes.push("Removed the `lovable-tagger` dev dependency (Lovable's visual-edit instrumentation — not needed here; LifemarkAI has its own visual edits).");
      }
    } else if (/^vite\.config\.(t|j)s$/.test(file.path)) {
      const stripped = stripTaggerFromViteConfig(content);
      if (stripped !== content) {
        isLovable = true;
        notes.push("Removed the `componentTagger()` plugin from vite.config.");
      }
      content = stripped;
    } else if (file.path === "index.html") {
      const stripped = stripGptEngineerScript(content);
      if (stripped !== content) {
        isLovable = true;
        notes.push("Removed the legacy Lovable (gptengineer.js) script tag from index.html.");
      }
      content = stripped;
    } else if (/\.(t|j)sx?$/.test(file.path) && /["']https:\/\/[\w-]+\.supabase\.co["']/.test(content)) {
      // Unchain from Lovable Cloud: hardcoded backend creds → env-first.
      const res = envifySupabaseClient(content);
      if (res.changed) {
        isLovable = true;
        content = res.content;
        notes.push(
          `Rewrote the hardcoded Supabase URL/key in ${file.path} to read VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY first (original values kept as fallback, so it still works today). Set those in the Env panel — or enable Lifemark Cloud and it's done for you — to move off the Lovable backend.`,
        );
      }
    }

    files.push({ ...file, content });
  }

  // Backend / AI gateway detection — flag, never rewrite (the code is correct;
  // only the credentials/endpoints are Lovable-hosted).
  const allCode = files
    .filter((f) => /\.(tsx?|jsx?|html|env|toml|json)$/.test(f.path) || f.path.startsWith(".env"))
    .map((f) => f.content)
    .join("\n");

  if (/VITE_SUPABASE_URL|supabase\.co/i.test(allCode)) {
    notes.push(
      "This app uses a Supabase backend. If it was on Lovable Cloud, that database stays with Lovable — enable Lifemark Cloud (Cloud panel) or connect your own Supabase (DB panel), then update VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the Env panel.",
    );
  }
  if (/LOVABLE_API_KEY|lovable.*gateway|api\.lovable/i.test(allCode)) {
    notes.push(
      "This app calls Lovable AI (LOVABLE_API_KEY). Swap it to the built-in AI proxy: enable AI Integration in the editor and the auto-wire step scaffolds src/lib/ai.ts for you.",
    );
  }
  if (files.some((f) => /supabase\/functions\//.test(f.path))) {
    notes.push(
      "Edge functions detected (supabase/functions/). Deploy them to your own Supabase project after connecting it.",
    );
  }

  return { files, notes, isLovable, packageName };
}
