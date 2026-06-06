export interface DocPage {
  slug: string;
  title: string;
  description: string;
  category: string;
  sections: Array<{ heading?: string; body: string }>;
}

export const DOC_PAGES: DocPage[] = [
  {
    slug: "getting-started",
    title: "Getting Started",
    description: "Create your first project and ship with AI.",
    category: "Start",
    sections: [
      {
        body: "LifemarkAI is an AI-powered app builder. Describe what you want in chat, switch to **Build** mode to generate files, and preview instantly in the editor.",
      },
      {
        heading: "Quick start",
        body: "1. Sign up and create a project from the dashboard\n2. Open the editor — use starter prompts or pick a template\n3. Chat in **Plan** mode to architect, then **Build** to generate code\n4. Deploy from the editor or Go Live checklist\n5. Optional: enable **Lifemark Cloud** for hosted backend (DB, auth, storage)",
      },
      {
        heading: "Editor modes",
        body: "**Plan** — architecture and investigation before coding\n**Build** — full file generation with subagent research\n**Chat** — Q&A about your codebase\n**Agent** — autonomous multi-step edits",
      },
    ],
  },
  {
    slug: "mcp-server",
    title: "MCP Server",
    description: "Connect Claude Desktop, Cursor, and other MCP clients.",
    category: "Integrations",
    sections: [
      {
        body: "LifemarkAI exposes an HTTP MCP server at `/api/mcp`. Generate a token in the editor **MCP** panel, then connect your client.",
      },
      {
        heading: "Claude Desktop",
        body: "```\nclaude mcp add lifemarkai --transport http https://lifemarkai.app/api/mcp?token=YOUR_TOKEN\n```",
      },
      {
        heading: "Cursor",
        body: "Add to `.cursor/mcp.json`:\n```json\n{\n  \"lifemarkai\": {\n    \"url\": \"https://lifemarkai.app/api/mcp?token=YOUR_TOKEN\"\n  }\n}\n```",
      },
      {
        heading: "Tools",
        body: "list_projects · get_project_files · update_project_file · send_chat_message · create_project · get_project_info · deploy_project · get_deploy_status · list_templates",
      },
    ],
  },
  {
    slug: "native-apps",
    title: "Native Apps",
    description: "Ship iOS, Android, and desktop from your web project.",
    category: "Publish",
    sections: [
      {
        body: "LifemarkAI projects are web-first. Wrap them for app stores with **Capacitor** (mobile) or **Electron** (desktop).",
      },
      {
        heading: "Mobile (Capacitor)",
        body: "1. Deploy your app to a public HTTPS URL\n2. Set `server.url` in `capacitor.config.ts` to your deploy URL\n3. Run `npm run cap:add:ios` or `cap:add:android`\n4. Run `npm run cap:sync` then `cap:open:ios` / `cap:open:android`\n5. Submit via Xcode / Android Studio",
      },
      {
        heading: "Desktop (Electron)",
        body: "1. `npm run electron:dev` — dev wrapper around localhost\n2. `npm run electron:build:mac|win|linux` — distributable packages\n3. Config lives in `electron/` — loads production URL when packaged",
      },
      {
        heading: "Editor panel",
        body: "Open **Native Apps** in the editor sidebar for step-by-step commands and AI prompts to mobile-optimize your UI.",
      },
    ],
  },
  {
    slug: "lifemark-cloud",
    title: "Lifemark Cloud",
    description: "Managed backend, AI tool permissions, and usage.",
    category: "Cloud",
    sections: [
      {
        body: "Lifemark Cloud provides hosted Postgres, auth, storage, edge functions, secrets, and built-in AI — similar to Lovable Cloud.",
      },
      {
        heading: "Enable Cloud",
        body: "Open **Lifemark Cloud** in the editor → choose region → Enable on Tiny tier (free). Region locks after provisioning.",
      },
      {
        heading: "AI tool permissions",
        body: "**Allow** — AI runs cloud ops automatically\n**Ask** — AI describes changes and waits for confirmation\n**Never** — blocked; use the Cloud panel manually\n\nConfigure under Cloud → Advanced → AI tool permissions.",
      },
    ],
  },
  {
    slug: "seo-semrush",
    title: "SEO & Semrush",
    description: "Site audits and live keyword research.",
    category: "Growth",
    sections: [
      {
        body: "The **SEO** panel has two tabs: **Site Audit** (heuristic checks) and **Semrush Research** (live API when configured).",
      },
      {
        heading: "Semrush setup",
        body: "Add `SEMRUSH_API_KEY` to your server environment. Run keyword or domain research, then **Send research to AI chat** to optimize content.",
      },
    ],
  },
  {
    slug: "production-deploy",
    title: "Production Deploy",
    description: "Checklist before shipping LifemarkAI to production.",
    category: "Publish",
    sections: [
      {
        body: "Run the parity verification suite locally before every production deploy:",
      },
      {
        heading: "Verify",
        body: "```\nnpm run verify:production\nnpm run verify:smoke\nnpm run build\n```\n\n`verify:production` runs parity + env + build artifact checks. `verify:smoke` hits live routes (home, docs, MCP, templates) — run with dev or `npm start` running.",
      },
      {
        heading: "Database",
        body: "Apply pending migrations — at minimum:\n- `058_element_comments.sql` — pinned preview comments\n- `061_cloud_tool_permissions.sql` — Cloud AI tool permissions\n\n```\nsupabase db push\n```",
      },
      {
        heading: "Environment",
        body: "Required: Supabase URL/keys, `OPENAI_API_KEY`, `NEXT_PUBLIC_APP_URL`\nOptional: `SEMRUSH_API_KEY`, `NETLIFY_AUTH_TOKEN`, Stripe keys, AI gateway vars",
      },
      {
        heading: "Post-deploy",
        body: "1. Hard-refresh editor (Ctrl+Shift+R) to bust service worker cache\n2. Smoke-test: open editor, run a Build, deploy, check MCP GET /api/mcp\n3. Confirm Cloud permissions save under Advanced tab",
      },
    ],
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}
