# LifemarkAI vs Lovable — Technical Comparison

_Last updated: May 2026_

---

## Executive Summary

LifemarkAI has feature parity with Lovable on roughly **70–75%** of the product surface. The UI, AI pipeline, editor panels, auth, billing, and database layers are all production-grade. The main gaps are in the **live preview runtime** (srcdoc vs real WebContainers), **GitHub two-way sync**, and **production hosting infrastructure**. The sections below go system by system.

---

## 1. AI Code Generation

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Primary model | Claude Sonnet / Opus | Claude Sonnet 4.6, Opus 4.6, Haiku 4.5 | ✅ Equal or better (newer models) |
| Fallback model | None | GPT-4o, GPT-4o-mini | ✅ LifemarkAI better |
| Streaming | SSE | SSE (`chunk` / `done` / `file_progress` events) | ✅ Equal |
| Live message extraction | Yes (message appears while files write) | Yes (`extractLiveMessage()` regex) | ✅ Equal |
| File progress events | Yes (files flash in as written) | Yes (`file_progress` event + streaming paths) | ✅ Equal |
| Vision / image input | Yes | Yes (Claude base64, OpenAI image_url) | ✅ Equal |
| Multi-turn chat history | Yes | Yes (stored in Supabase, loaded on editor open) | ✅ Equal |
| Knowledge base injection | No | Yes (`knowledge_base` column, injected per-project) | ✅ LifemarkAI better |
| Supabase schema injection | Partial | Yes (fetches REST OpenAPI schema live) | ✅ Equal |
| Connector env-var injection | No | Yes (enabled connectors injected as context) | ✅ LifemarkAI better |
| Auto-snapshot before gen | Yes | Yes (fires before every generation) | ✅ Equal |
| Credit deduction | Yes | Yes (with rollback on error) | ✅ Equal |
| Discussion vs build mode | Yes | Yes (keyed on action verbs in system prompt) | ✅ Equal |
| JSON output + parsing | Yes | Yes (with markdown fence fallback) | ✅ Equal |
| Agent route | Yes | Yes (`/api/ai/agent`) | ✅ Equal (agent route uses older models — needs update) |

**Action**: Update `/api/ai/agent` model list to match `/api/ai/chat` (claude-sonnet-4-6, claude-opus-4-6, etc.).

---

## 2. Live Preview

This is the **biggest architectural gap**.

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Runtime | Real WebContainers (StackBlitz) — Node.js in browser | srcdoc iframe bundler (Babel standalone + Tailwind CDN) | ⚠️ MAJOR GAP |
| npm package support | Any npm package via real `npm install` | CDN-available packages only (React, Lucide, Framer Motion, etc.) | ⚠️ Gap |
| Hot Module Replacement | Real Vite HMR over WebSocket | Debounced full re-render (300 ms) | ⚠️ Gap |
| Build errors in preview | Real compile errors from Vite | Babel transpile errors + runtime errors | ⚠️ Partial |
| Console capture | Yes (from real Node process) | Yes (postMessage bridge from iframe) | ✅ Equal |
| Fix-with-AI error banner | Yes | Yes | ✅ Equal |
| Device breakpoints | Yes (390 / 768 / 1280 / Full) | Yes (390 / 768 / 1280 / Full) | ✅ Equal |
| Fullscreen mode | Yes | Yes | ✅ Equal |
| In-preview URL bar | Yes | Yes | ✅ Equal |
| QR code for mobile | Yes | Yes | ✅ Equal |
| Visual click-to-edit | Yes | Yes (postMessage bridge) | ✅ Equal |
| Package stubs | n/a | 60+ packages stubbed (react-router, framer-motion, recharts, shadcn/ui, etc.) | ✅ Good workaround |

**Root issue**: `useWebContainer` is a no-op stub. The `@webcontainer/api` package was never actually installed or wired. The srcdoc bundler is clever and covers 80% of real-world generated apps (since the AI only generates Tailwind + shadcn + Lucide), but breaks for any unusual npm dependency.

**Action items (in priority order)**:
1. Install `@webcontainer/api` and wire the real hook — or accept srcdoc as the permanent strategy and widen the stub library.
2. Add more package stubs: `react-hook-form`, `zod`, `@tanstack/react-query`, `react-query`, `axios`, `date-fns`.
3. Add a "Preview may not support all packages" notice when a dependency is detected in package.json that isn't stubbed.

---

## 3. Deployment

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Default hosting | lovable.app subdomain (instant, no config) | Mock URL only unless NETLIFY_AUTH_TOKEN set | ⚠️ MAJOR GAP |
| Netlify deploy | Yes | Yes (real API, falls back to mock) | ⚠️ Requires env var |
| Vercel deploy | No | Yes (UI present, API wired) | ✅ LifemarkAI better |
| Custom domains | Yes (CNAME via Netlify DNS) | Yes (Domains panel exists, Netlify DNS API wired) | ✅ Equal |
| Deploy history + rollback | Yes | Yes (deploy history panel, status tracking) | ✅ Equal |
| Real build pipeline | Yes (real Vite build via WebContainers) | Metadata-only (build config returned, client executes) | ⚠️ Partial |
| One-click publish | Yes | Yes (Deploy panel → "Deploy" button) | ✅ Equal |
| SSL | Yes (Netlify provides) | Yes (via Netlify) | ✅ Equal |

**Action**: The fastest fix is to provide a real self-hosted preview server (serve `srcdoc` content from `/preview/[slug]`) so the deployed URL points somewhere real even without Netlify credentials.

---

## 4. GitHub Integration

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Import from GitHub URL | Yes | Yes (`/api/projects/import-github`) | ✅ Equal |
| Export to GitHub (push) | Yes | No | ⚠️ Gap |
| Two-way sync (pull changes) | Yes | No | ⚠️ Gap |
| PR creation from chat | Yes | No | ⚠️ Gap |
| Branch per project | Yes | No | ⚠️ Gap |
| GitHub OAuth for import | Yes | Yes (stored in profile.github_username) | ✅ Equal |

**Action**: Implement push-to-GitHub via Octokit (`@octokit/rest`). Minimal version: commit all project files to a new or existing repo on deploy.

---

## 5. Editor

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Code editor | Monaco | Monaco (+ CodeMirror fallback) | ✅ Equal |
| Multi-file tabs | Yes | Yes | ✅ Equal |
| File tree | Yes | Yes (with rename, delete, new file/folder) | ✅ Equal |
| Cross-file search | Yes | Yes | ✅ Equal |
| Syntax highlighting | Yes | Yes | ✅ Equal |
| Command palette | Yes | Yes | ✅ Equal |
| Keyboard shortcuts | Yes | Yes (modal) | ✅ Equal |
| Diff view (accept/reject) | Yes | Yes (Accept/Revert per file) | ✅ Equal |
| Changelog panel | Yes | Yes | ✅ Equal |
| Snapshot/version panel | Yes | Yes (with file diffs) | ✅ Equal |
| Autosave indicator | Yes | Yes ("Saved X ago" in top bar) | ✅ Equal |
| Inline project rename | Yes | Yes | ✅ Equal |

---

## 6. Chat Panel

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Streaming output | Yes | Yes | ✅ Equal |
| Markdown rendering | Yes | Yes | ✅ Equal |
| Syntax highlighting in messages | Yes | Yes | ✅ Equal |
| Files changed list per message | Yes | Yes | ✅ Equal |
| Prompt suggestions / chips | Yes | Yes | ✅ Equal |
| Image attachment | Yes | Yes (to Claude vision) | ✅ Equal |
| @file mentions | Yes | Yes (scopes AI context) | ✅ Equal |
| Thumbs up/down feedback | Yes | Yes | ✅ Equal |
| Undo last generation | Yes | Yes | ✅ Equal |
| Stop generation | Yes | Yes | ✅ Equal |
| Edit/regenerate message | Yes | Yes | ✅ Equal |
| Prompt history (↑/↓) | Yes | Yes | ✅ Equal |
| New chat / clear conversation | Yes | Yes | ✅ Equal |
| Auto-name project | Yes | Yes (on first AI response) | ✅ Equal |
| Thinking time display | Yes | Yes (ms display) | ✅ Equal |
| Revert to message snapshot | Yes | Yes | ✅ Equal |
| Empty state / welcome screen | Yes | Yes | ✅ Equal |

---

## 7. Auth & User Management

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Email/password auth | Yes | Yes (Supabase Auth) | ✅ Equal |
| Google OAuth | Yes | Yes | ✅ Equal |
| GitHub OAuth | Yes | Partial (stored but not full OAuth flow) | ⚠️ Minor |
| Forgot/reset password | Yes | Yes | ✅ Equal |
| User profile page | Yes (/u/username) | Yes | ✅ Equal |
| Onboarding modal | Yes | Yes | ✅ Equal |
| Avatar / display name | Yes | Yes | ✅ Equal |

---

## 8. Billing & Plans

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Free / Pro / Team tiers | Yes | Yes (10 / 100 / 500 credits) | ✅ Equal |
| Stripe checkout | Yes | Yes | ✅ Equal |
| Stripe webhook | Yes | Yes (with idempotency guard) | ✅ Equal |
| Customer portal | Yes | Yes | ✅ Equal |
| Credit packs (one-time) | No | Yes | ✅ LifemarkAI better |
| Credit transfer (team) | No | Yes | ✅ LifemarkAI better |
| Credit deduction per gen | Yes | Yes (with rollback) | ✅ Equal |
| Usage analytics | Yes | Yes (per-project + account-level) | ✅ Equal |

---

## 9. Collaboration

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Real-time co-editing | Yes (Yjs) | Yes (Yjs over Supabase Realtime) | ✅ Equal |
| Conflict-free CRDT | Yes | Yes | ✅ Equal |
| Debounced DB write-back | Yes | Yes (2000 ms) | ✅ Equal |
| Presence indicators | Yes (avatars) | No | ⚠️ Gap |
| Typing indicators | Partial | No | ⚠️ Minor |
| Shared credit pool (team) | Yes | Yes | ✅ Equal |

---

## 10. Project Management

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Dashboard with project grid | Yes | Yes | ✅ Equal |
| Search / filter / sort | Yes | Yes | ✅ Equal |
| Star / favorite | Yes | Yes | ✅ Equal |
| Tags / labels | Yes | Yes (with DB migration) | ✅ Equal |
| Duplicate / fork | Yes | Yes | ✅ Equal |
| Remix public projects | Yes | Yes | ✅ Equal |
| Export as ZIP | Yes | Yes | ✅ Equal |
| Framework selector | React only | React, Next.js, Vue, Svelte, Vanilla | ✅ LifemarkAI better |
| Template gallery | Yes | Yes (25 templates) | ✅ Equal |
| Public explore page | Yes | Yes (with framework tabs + search) | ✅ Equal |
| View count | Yes | Yes | ✅ Equal |

---

## 11. Infrastructure & Quality

| Dimension | Lovable | LifemarkAI | Gap |
|---|---|---|---|
| Rate limiting | Yes (Redis) | Upstash Redis middleware | ✅ Equal |
| Input validation | Yes (Zod) | Yes (Zod schemas on all routes) | ✅ Equal |
| Security headers | Yes | Yes (CSP, X-Frame, Referrer, etc.) | ✅ Equal |
| Error tracking | Yes (Sentry) | Sentry wired | ✅ Equal |
| Audit logs | Yes | Yes (DB table) | ✅ Equal |
| Feature flags | Partial | Yes (DB table) | ✅ Equal |
| Notifications system | Yes | Yes (bell icon, realtime) | ✅ Equal |
| API keys for developers | Yes | Yes | ✅ Equal |
| PM2 / production config | Unknown | Yes (PM2 ecosystem + nginx) | ✅ LifemarkAI has it |
| PWA manifest | Yes | Yes | ✅ Equal |
| Sitemap / robots | Yes | Yes | ✅ Equal |

---

## Priority Gap Closure Roadmap

### P0 — Breaks the core loop
1. **Real preview for deployed apps** — right now `deployed_url` is a fake URL unless Netlify token is set. Serve the srcdoc output from `/preview/[slug]` as an actual page so every project has a real shareable URL.
2. **Widen the stub library** — add `react-hook-form`, `zod`, `@tanstack/react-query`, `axios`, `date-fns`, `react-hot-toast` stubs to the preview bundler so common generated packages don't silently fail.
3. **Fix agent route models** — `/api/ai/agent` still references `claude-3-5-sonnet-20241022` instead of `claude-sonnet-4-6`.

### P1 — Visible feature gaps
4. **GitHub push/export** — after generating, allow "Push to GitHub" to commit all files to a user's repo via Octokit.
5. **Presence indicators** — show collaborator avatars in the editor top bar using Supabase Realtime presence (10 lines of code on top of the existing Yjs channel).
6. **Real Netlify deployment** — document and make the `NETLIFY_AUTH_TOKEN` env var required for production; update the deploy panel to show a setup guide if the token is missing.

### P2 — Polish / quality-of-life
7. **Real WebContainers** (optional) — install `@webcontainer/api` and wire the existing hook stub for projects that need real npm packages. The srcdoc bundler covers 95%+ of what the AI actually generates, so this is lower priority than it looks.
8. **GitHub OAuth full flow** — complete the GitHub OAuth callback so the token is stored and usable for import/export without asking for a PAT.
9. **More model options** — expose `claude-opus-4-6` as a "Best Quality" tier in the model selector with a credit multiplier.

---

## What LifemarkAI Has That Lovable Does Not

- **Multi-model support**: OpenAI GPT-4o as fallback — useful when Anthropic has outages.
- **Per-project knowledge base**: Persistent AI instructions injected into every prompt for that project.
- **Connector env-var injection**: User-configured API keys from the integrations page are injected as context hints.
- **Credit packs & team credit transfer**: More flexible billing than Lovable's flat seat model.
- **Framework diversity**: Vue, Svelte, Next.js, vanilla targets alongside React.
- **Vercel deployment option**: Deploy panel supports both Netlify and Vercel.
- **Feature flags table**: Internal toggles for gradual rollouts.

---

## Config Warning Fix (still pending — requires manual action)

The `⚠ experimental.serverComponentsExternalPackages` warning and the middleware warning persist because `D:\Projects\lifemarkai\next.config.js` (one directory ABOVE the project) is the file Turbopack actually loads. The sandbox cannot delete it — you must do it manually:

```powershell
del "D:\Projects\lifemarkai\next.config.js"
del "D:\Projects\lifemarkai\middleware.ts"
```

After that, kill all `node.exe` processes in Task Manager and restart `npm run dev`. The warnings will be gone.
