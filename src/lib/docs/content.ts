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
    ],
  },
  {
    slug: "lifemark-cloud",
    title: "Lifemark Cloud",
    description: "Managed backend, AI tool permissions, and usage.",
    category: "Cloud",
    sections: [
      {
        body: "Lifemark Cloud provides hosted Postgres, auth, storage, edge functions, secrets, and built-in AI.",
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
        body: "Run the parity verification suite locally before every production deploy.",
      },
    ],
  },
];

export function getDocBySlug(slug: string): DocPage | undefined {
  return DOC_PAGES.find((p) => p.slug === slug);
}
