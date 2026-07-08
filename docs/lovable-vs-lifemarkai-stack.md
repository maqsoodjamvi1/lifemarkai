# Lovable vs. LifemarkAI — Stack Comparison & Parity Map

_Derived from a live capture of Lovable's editor (project "Lifemark CargoFlow", July 2026) cross-referenced against Lovable's public docs, mapped onto LifemarkAI's current codebase._

Two caveats up front. First, everything in the "Lovable" column for the **client** is read straight from the served HTML/asset manifest and inline styles — not from decoding any obfuscated bundle. Second, Lovable's **model** choices are server-side and were confirmed from Lovable's own documentation, not the client.

---

## The one thing the HTML can't tell you: models

Lovable runs **two separate model stacks**, and conflating them is the most common mistake when reverse-engineering the client:

1. **The builder agent** — the model that writes, edits, and reasons about your code. Lovable made **Claude Sonnet 4.5** the default here (rolled out November 2025), with in-chat model switching across frontier models. None of this appears in the client bundle; it lives behind the protobuf/Connect-RPC agent API.
2. **The in-app AI connector** — the models your _built app_ calls at runtime (chatbots, summaries, RAG, image gen). This defaults to **Gemini 3 Flash (preview)** and exposes a large catalog: Gemini 3.x / 2.5 (Flash/Pro/Lite/Image), GPT-5.5 / 5.4 / 5.x (Pro/Mini/Nano), GPT Image 2, and embedding models (gemini-embedding-001 default, OpenAI text-embedding-3). Billed usage-based at provider cost, with a `LOVABLE_API_KEY` auto-provisioned per project and calls routed through a backend edge function.

LifemarkAI mirrors this split conceptually but not by model identity: the **builder** routes through `generateAI()` → OpenRouter tiers (Pareto Code for coding, Fusion for planning/chat, DeepSeek V4 Flash for fast), and the **in-app** side is the connector gateway + DALL·E 3 for images. LifemarkAI has no per-app runtime AI-model catalog equivalent to Lovable's in-app connector menu.

---

## Client framework & build

| Layer | Lovable (observed) | LifemarkAI | Status |
|---|---|---|---|
| Framework | React SPA | Next.js 14 App Router | Divergent by design |
| Bundler | **Rolldown** (Rust; next-gen Vite) | Next/Turbopack + webpack | Divergent |
| Routing anim | View Transitions API (`@view-transition`) | Framer Motion route transitions | Gap (minor) |
| Schema validation | **Zod** (`__zod_globalConfig` jitless) | Zod | Parity |

Lovable ships a client-rendered Vite SPA; LifemarkAI is server-rendered Next.js. This is a deliberate architectural fork, not a gap to close — it's why Lovable can lean on `modulepreload`-heavy code-splitting and why LifemarkAI gets SSR/route-handler ergonomics instead.

## UI & design system

| Element | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Primitives | **Base UI** (`@base-ui-components`) + Radix (in migration) | Radix via shadcn/ui | Partial gap |
| Tokens | OKLCH + `light-dark()`, semantic `--fg/--bg`, layered-fx buttons, "pulse" system | OKLCH token layer + `fx-button` + pulse-like tokens (added this session) | Parity (new) |
| Animation | Framer Motion | Framer Motion | Parity |
| Toasts | **Sonner** (via goober) | Sonner (added this session) | Parity (new) |
| Markdown | react-markdown + refractor/Prism | react-markdown | Parity |
| Sanitization | **DOMPurify** (direct) | `isomorphic-dompurify` via `lib/security/sanitize.ts`; wired into the mermaid-SVG and docs HTML renders (added this pass) | Parity (new) |

The visual parity work from this session (OKLCH tokens, fx-button, animated view-switcher pill, URL-bar pill, Sonner) closed most of the surface-level gap. The remaining real difference is **Base UI**: Lovable is migrating off Radix onto Base UI, whereas LifemarkAI stays on Radix/shadcn. That's a defensible choice — no need to chase it unless a specific Base UI component is worth it.

## Chat input & editor

| Element | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Prompt input | **Tiptap/ProseMirror** (`ChatInputTiptap`), mentions + skill/slash suggestions | Tiptap input with textarea-compat handle (added this session) | Parity (new) |
| Code editor | (not surfaced in this capture) | Monaco | N/A |
| @-mentions | `mentionParsing` | preserved across Tiptap swap | Parity |

## Data, auth & backend

| Layer | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Editor auth | **Firebase Auth** | Supabase Auth (Email + GitHub) | Divergent |
| Editor data | Firestore + Realtime DB | Supabase Postgres + Realtime | Divergent |
| Managed app backend | Supabase (Lovable Cloud) | Lifemark Cloud (managed Supabase per app) | Parity |
| Agent API transport | **Protobuf / Connect-RPC** (`*_pb`) | JSON/SSE routes | Gap (architectural) |
| Data fetching | TanStack Query | TanStack Query | Parity |

Two notable divergences: Lovable uses **Firebase** for its _own_ editor auth/state while offering Supabase as the app backend; LifemarkAI is Supabase top-to-bottom. And Lovable's agent speaks **protobuf over Connect-RPC**, versus LifemarkAI's JSON+SSE. The protobuf transport is a scaling/latency choice, not a user-visible feature — low priority.

## Agent, skills & connectors

| Element | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Agent loop | Autonomous "Agent Mode" | Editor Intelligence orchestrator (10 roles + AI CTO) + ReAct agent | Parity/ahead |
| Skills / slash commands | `skillQueries`, `useSkillCommandSuggestion`, registry | `/`-triggered picker in chat-panel: skills (from `/api/skills`) + prompt-template groups, filtered by query; **keyboard nav added this pass** | Parity |
| Connectors | **MCP** (`useConnectorsMcp`, local MCP inventory) | Connector gateway (15 connectors) | Partial — different protocol |
| Security agent | "Try to fix all" + security memory + `security_pb` | Security Center scans + "Try to fix all" bar (this session) | Parity (new) |
| Evals/observability | **Braintrust** | Self-hosted `ai_eval_log` (migration 080) + `lib/ai/eval-log.ts`, hooked non-blocking into `generateAI` (added this pass) | Partial (self-hosted) |

LifemarkAI's multi-agent orchestrator is arguably _ahead_ of Lovable's single Agent Mode. The genuine gaps here are (a) a **skills/slash-command registry** with suggestion UI, (b) **MCP** as the connector protocol (LifemarkAI uses its own gateway), and (c) an **eval/observability layer** like Braintrust for prompt/model regression testing.

## Preview architecture

| Element | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Preview host | `id-preview--<projectId>.lovable.app` | `/preview/<id>` (+ optional `NEXT_PUBLIC_PREVIEW_ORIGIN`) | Parity |
| Token | RS256 JWT — `iss: lovable-api`, `aud: [lovable-app]`, `access_type: project`, ~7-day exp | RS256/HS256 JWT — `iss: lifemarkai-preview`, `aud: lifemarkai-app`, 24h default | Parity (new) |
| Cache-bust | `__lovable_sha=<build>` | `sha` param | Parity |
| Load trace | `__lovable_load_id` | (not implemented) | Gap (minor) |

The signed-preview work from this session is a direct structural match to Lovable's model — project-scoped, short-lived, RS256. The only cosmetic gap is a `load_id` correlation param, which is trivial to add if we want per-load tracing.

## Ops & third-party

| Element | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Error tracking | Sentry | Sentry (`@sentry/nextjs`) | Parity |
| In-browser test | Playwright (shipped client-side) | Playwright in self-verify loop (server-side) | Parity |
| i18n | **Paraglide** (inlang) | (none) | Gap |
| Marketing analytics | RudderStack → GA4/HubSpot/TikTok/Meta/LinkedIn/Bing; Impact affiliate | (verify) | N/A (dashboard-only) |

Note: Lovable's analytics stack loads on the **dashboard shell**, not inside the built app's preview iframe — it's Lovable's own telemetry, not something injected into user apps. Don't treat it as a product feature to replicate.

---

## Closed in this pass

- **DOMPurify sanitizer** — `isomorphic-dompurify` + `lib/security/sanitize.ts` (`sanitizeHtml` / `sanitizeSvg`); wired into the AI-authored mermaid-SVG render (`chat-panel.tsx`) and the docs HTML render (`docs-page.tsx`).
- **Preview `load_id`** — `newLoadId`/`withLoadId` in `preview-url.ts`; a stable per-mount id threads through `usePreviewToken`, matching Lovable's `__lovable_load_id`.
- **AI eval/observability (self-hosted)** — migration `080_ai_eval_log.sql` + `lib/ai/eval-log.ts`, hooked non-blocking into `generateAI` (records model, latency, tokens, tool-calls, success/error, gateway flag).
- **Slash-picker keyboard navigation** — Arrow/Enter/Tab + highlight for the existing skills+templates `/` picker in `chat-panel.tsx` (was mouse + Escape only).
- **AI metrics dashboard** — read-only view over `ai_eval_log` at `/dashboard/ai-evals` (`components/dashboard/ai-evals-page.tsx` + sidebar entry): per-model calls, success rate, p50/p95 latency, tokens, gateway %, and recent failures; RLS-scoped, time-range filtered.

> Correction to an earlier draft of this doc: the skills/slash **picker already existed** in LifemarkAI (it was mis-marked as a gap). This pass only added keyboard nav.

## Remaining gaps worth closing

Ranked by leverage, not effort:

1. **In-app AI connector model catalog.** Lovable lets built apps pick from a runtime model menu (Gemini/GPT/image/embeddings). LifemarkAI's connector gateway + DALL·E 3 is narrower. Medium leverage if users build AI-powered apps.
2. **i18n.** No i18n layer at all (Lovable uses Paraglide). Only worth it once a second locale is real.
3. **Base UI migration, protobuf transport.** Architectural nice-to-haves. Low priority; only pursue with a concrete reason.

_(Eval surfacing is now done — see the AI metrics dashboard above.)_

## Deliberate non-goals (don't chase these)

- **Firebase for editor auth** — LifemarkAI's all-Supabase model is simpler; Lovable's Firebase use is legacy.
- **Rolldown / Vite SPA** — LifemarkAI's Next.js SSR is a different, valid architecture.
- **Marketing analytics stack** — dashboard telemetry, not a product capability.

---

### Sources
- Lovable AI features / model catalog: https://docs.lovable.dev/integrations/ai
- Agent Mode (default builder agent): https://lovable.dev/blog/agent-mode-beta
- Claude Sonnet 4.5 as default builder model (Nov 2025): reported via Lovable changelog / third-party review coverage
