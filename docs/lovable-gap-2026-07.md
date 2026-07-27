# Lovable vs LifemarkAI — Gap Analysis (refreshed Jul 23 2026)

Source: full read of Lovable's product changelog (Mar 16 → Jul 16 2026) cross-referenced
against the LifemarkAI codebase. This supersedes the older `lovable-gap-closure.md` for the
2026 feature wave.

## Already at parity (built — do NOT rebuild)

AI/chat: Chat + Plan + Build + Agent modes; chat history search; line-number code refs
(`Cmd+Shift+L`); `@connector` + cross-project `@` refs; per-request AI activity view; agent
web_search/fetch_url/db_query tools; multi-model routing (Pareto/Fusion/DeepSeek via OpenRouter).
Design: **design-directions-panel.tsx** (3 directions), clarify wizard (palette/typography/layout),
visual edits + inline text edit, preview interaction toolbar, Figma panel.
Preview/editor: Modal live preview, Core Web Vitals, markdown preview, media gallery, file-tree
duplicate/drag, collapse-all, status badge, guest comments in shared previews, SVG previews.
Cloud/DB: managed Supabase per app, pause/resize from chat, SQL export, Jobs tab, DB health +
slow-query finder, backups/restore, region selection, unified credit balance, AI gateway TTS/STT.
Connectors: 40+ connector gateway, approval cards, per-project connectors page, static egress.
Deploy/SEO: publish-from-chat + security gate, unpublished dot, SEO tab + sitemap, visitor
analytics, custom domains, "Edit with" badge.
Enterprise: SSO/SCIM, immutable audit log (migration 077), Security Center + scheduled scans,
publish PII gate, sign-in alerts, IPTC AI-provenance, top-up packs.
Distribution: public API + MCP server, Electron desktop + Capacitor mobile scaffold.
Backend framework: SSR-first (Next.js App Router) generation — Lovable's equivalent is TanStack Start.

## Genuine gaps (missing — prioritized)

| # | Gap (Lovable, date) | LifemarkAI today | Effort | Value |
|---|---------------------|------------------|--------|-------|
| 1 | **Queue messages while agent works** (Jun 10) — type the next change while the current one runs; auto-sends when done | Composer is disabled while `streaming`; no queue | S | High (daily UX) |
| 2 | **Chat response tips / feature suggestions during processing** (May 21) | none | S | Med |
| 3 | **Smart PWA** (Jun 3) — per-request installable/offline/push | none | S–M | Med |
| 4 | **Embeddings / RAG in the AI gateway** (May 18) — embedding models + semantic search for generated apps | gateway has text/image/TTS/STT, no embeddings | M | Med–High |
| 5 | **Publish app as MCP actions / "agent integrations"** (Jul 15) — let ChatGPT/Claude call your deployed app | own MCP server exists, but not per-published-app action exposure | M | High (platform) |
| 6 | **App user connectors** (Jul 13) — each end-user connects their OWN Google/Slack/Salesforce/… account | connector gateway is per-project (owner creds), not per-end-user OAuth | M–L | High (enterprise) |
| 7 | **Auto user recognition in built apps** (Jul 16) — internal apps recognize the signed-in workspace user, no login page | none | M–L | Med (enterprise) |
| 8 | **On-request pre-rendering for crawlers** (May 13) | build-time SEO meta only | M | Med (SEO) |
| 9 | **Workspace skills / playbooks** (May 18) — named markdown playbooks, import SKILL.md | none (LifemarkAI's own skills are separate) | M | Med |
| 10 | **Priority processing / faster regional previews** | infra | — | infra, not a feature |

## Recommendation

Start with the low-effort, high-value, self-contained wins that don't destabilize the giant
chat-panel/gateway: **#1 message queueing** and **#3 PWA** first, then **#5 publish-as-MCP**
(new route, additive) and **#4 embeddings** (gateway-local). #6/#7 (per-end-user OAuth,
workspace-identity auth) are the biggest enterprise gaps but are multi-file (DB + OAuth + UI)
and should be scoped as their own initiatives.

Sources: Lovable changelog (docs.lovable.dev/changelog), Lovable blog (chat-mode, mcp-servers).
