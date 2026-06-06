# LifemarkAI — Lovable Clone: Full Build Plan

> Goal: Build a platform equal to or more advanced than Lovable.dev
> Stack: Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase · OpenAI/Claude API · GitHub API · Stripe · Socket.io

---

## Feature Audit of Lovable.dev (Research Summary)

| Feature | Lovable Has | Our Target |
|---|---|---|
| AI Prompt → Full App Generation | ✅ | ✅ + Multi-model support |
| Agent Mode (autonomous AI) | ✅ | ✅ + Tool use + web search |
| Chat Mode (planning) | ✅ | ✅ |
| Plan Mode (review before code) | ✅ | ✅ |
| Visual Click-to-Edit | ✅ | ✅ |
| Voice Mode | ✅ | ✅ |
| Built-in Image Generation | ✅ | ✅ |
| Real-time Collaboration (20 users) | ✅ | ✅ + Presence avatars |
| GitHub Two-way Sync | ✅ | ✅ |
| Supabase Integration | ✅ | ✅ + Firebase option |
| Stripe Integration | ✅ | ✅ |
| Clerk Auth | ✅ | ✅ |
| One-click Deployment | ✅ | ✅ + Vercel/Netlify/Railway |
| Custom Domains | ✅ | ✅ |
| Credit System | ✅ | ✅ + Token transparency |
| Live Preview | ✅ | ✅ + Multi-device preview |
| Code Editor (Monaco) | Partial | ✅ Full VS Code-like |
| SSO (Enterprise) | ✅ | ✅ |
| Audit Logs | ✅ | ✅ |
| API Access | ❌ | ✅ REST + Webhooks |
| Multi-model AI (GPT-4, Claude, Gemini) | ❌ | ✅ |
| Component Library | ❌ | ✅ |
| Analytics Dashboard | ❌ | ✅ |
| Mobile App Preview | ❌ | ✅ |
| Template Marketplace | ❌ | ✅ |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                  │
│  Landing · Dashboard · Editor · Preview · Settings       │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                   API LAYER (Next.js API Routes)          │
│  /api/ai · /api/projects · /api/deploy · /api/github     │
└────┬───────────────┬──────────────┬──────────────────────┘
     │               │              │
┌────▼───┐    ┌──────▼─────┐  ┌────▼──────────┐
│ OpenAI │    │  Supabase  │  │  GitHub API   │
│ Claude │    │  Postgres  │  │  (Octokit)    │
│ Gemini │    │  Auth      │  └───────────────┘
└────────┘    │  Storage   │
              │  Realtime  │  ┌───────────────┐
              └────────────┘  │  Stripe API   │
                              └───────────────┘
              ┌────────────────────────────────┐
              │  Deployment Adapters           │
              │  Lovable Cloud / Vercel /      │
              │  Netlify / Railway             │
              └────────────────────────────────┘
```

---

## PHASE BREAKDOWN

---

## PHASE 1: Foundation & Core Infrastructure
**Duration: Week 1-2**
**Goal: Running Next.js app with auth, DB, and basic UI**

### Step 1.1 — Project Scaffolding
- [ ] `npx create-next-app@latest lifemarkai --typescript --tailwind --app`
- [ ] Install core deps: `shadcn/ui`, `lucide-react`, `framer-motion`, `zustand`, `react-query`
- [ ] Set up ESLint, Prettier, path aliases
- [ ] Configure `tailwind.config.ts` with custom design tokens (colors, fonts)
- [ ] Set up environment variables structure (`.env.local.example`)

### Step 1.2 — Database Schema (Supabase)
Tables to create:
```sql
users          -- id, email, name, avatar, plan, credits, created_at
projects       -- id, user_id, name, description, framework, status, created_at
project_files  -- id, project_id, path, content, language, updated_at
messages       -- id, project_id, role, content, tokens_used, created_at
deployments    -- id, project_id, url, status, provider, deployed_at
collaborators  -- id, project_id, user_id, role, invited_at
templates      -- id, name, description, category, preview_url, files_json
credit_logs    -- id, user_id, amount, action, project_id, created_at
```

### Step 1.3 — Authentication
- [ ] Supabase Auth with email/password, Google OAuth, GitHub OAuth
- [ ] Next.js middleware for protected routes
- [ ] User session management with Supabase SSR helpers
- [ ] Profile completion flow (name, avatar)

### Step 1.4 — Landing Page
- [ ] Hero section with animated demo
- [ ] Features section (Agent Mode, Visual Edit, Deploy)
- [ ] Pricing section (Free, Pro, Business, Enterprise)
- [ ] Testimonials / Social proof
- [ ] CTA + footer

### Step 1.5 — Dashboard Layout
- [ ] Sidebar navigation
- [ ] Projects grid (cards with preview thumbnails)
- [ ] New project button + modal
- [ ] User profile dropdown
- [ ] Credit balance indicator

---

## PHASE 2: AI Chat & Code Generation Engine
**Duration: Week 3-4**
**Goal: Users can describe an app and get generated React code**

### Step 2.1 — AI Provider Abstraction
- [ ] Create `lib/ai/provider.ts` — unified interface for OpenAI, Claude, Gemini
- [ ] Streaming support via `ai` SDK (Vercel AI SDK)
- [ ] Token counting and cost estimation
- [ ] Retry logic and fallback providers

### Step 2.2 — System Prompts & Context Builder
- [ ] Master system prompt for app generation
- [ ] Context injection: project files, user preferences, framework
- [ ] Few-shot examples for React+Tailwind+TypeScript output
- [ ] File-aware context (inject relevant file contents)

### Step 2.3 — Chat Mode UI
- [ ] Split-pane layout: Chat left, Preview/Code right
- [ ] Message bubbles (user / AI / system)
- [ ] Streaming token rendering (typewriter effect)
- [ ] Code block syntax highlighting in chat
- [ ] Follow-up question prompts from AI
- [ ] Message history with pagination

### Step 2.4 — Code Generation Pipeline
- [ ] Parse AI output → extract file changes
- [ ] Apply diffs to project files in Supabase
- [ ] File tree update after generation
- [ ] Error detection in generated code
- [ ] Auto-fix loop: if errors detected → re-prompt AI

### Step 2.5 — Plan Mode
- [ ] Before generating: AI outputs a structured plan
- [ ] Plan displayed as editable checklist
- [ ] User can approve/modify plan
- [ ] Only execute code gen after approval

---

## PHASE 3: Agent Mode (Autonomous AI)
**Duration: Week 5**
**Goal: AI autonomously explores codebase, builds, and debugs end-to-end**

### Step 3.1 — Tool Definitions
AI tools to implement:
```typescript
tools = {
  read_file: (path) => ...,
  write_file: (path, content) => ...,
  list_files: (dir) => ...,
  search_code: (query) => ...,
  run_tests: () => ...,
  search_web: (query) => ...,
  install_package: (name) => ...,
  read_error: (error) => ...,
}
```

### Step 3.2 — Agent Loop
- [ ] Implement ReAct pattern (Reason → Act → Observe → Repeat)
- [ ] Max iteration limit with user confirmation
- [ ] Progress stream: show each action in real-time
- [ ] Rollback mechanism if agent breaks things
- [ ] Agent memory: session-level context accumulation

### Step 3.3 — Agent UI
- [ ] "Thinking" animation with current step display
- [ ] Action log (expanded/collapsed)
- [ ] Stop button to interrupt
- [ ] Summary after completion

---

## PHASE 4: Code Editor & File System
**Duration: Week 6**
**Goal: Full in-browser VS Code-like experience**

### Step 4.1 — Monaco Editor Integration
- [ ] Install `@monaco-editor/react`
- [ ] Language detection from file extension
- [ ] IntelliSense / autocomplete
- [ ] Multi-file tabs
- [ ] Find & replace
- [ ] Vim mode toggle

### Step 4.2 — File Tree
- [ ] Collapsible file/folder tree
- [ ] Create / rename / delete files
- [ ] Drag to reorganize
- [ ] Right-click context menu
- [ ] Git status indicators (modified, added, deleted)

### Step 4.3 — Live Preview
- [ ] Sandboxed iframe preview
- [ ] Hot reload on file change
- [ ] Device preview switcher (Desktop / Tablet / Mobile)
- [ ] Preview URL sharing

---

## PHASE 5: Visual Edit Mode
**Duration: Week 7**
**Goal: Click any UI element in preview and edit it without prompts**

### Step 5.1 — Element Inspector
- [ ] Inject overlay script into preview iframe
- [ ] On hover: highlight element with bounding box
- [ ] On click: show edit popover
- [ ] Map DOM element → source file + line number

### Step 5.2 — Edit Popover UI
- [ ] Text content editor
- [ ] Color picker (background, text, border)
- [ ] Spacing controls (padding, margin)
- [ ] Font size, weight, family
- [ ] Tailwind class editor
- [ ] Apply → update source file directly

### Step 5.3 — Component Tree
- [ ] Show React component hierarchy
- [ ] Click component → jump to source
- [ ] Props inspector

---

## PHASE 6: GitHub Integration
**Duration: Week 8**
**Goal: Two-way sync with GitHub repos**

### Step 6.1 — GitHub OAuth Connection
- [ ] GitHub OAuth app setup
- [ ] Store GitHub token securely (encrypted in Supabase)
- [ ] Repo listing and selection

### Step 6.2 — Two-Way Sync
- [ ] Push project files → GitHub repo on save
- [ ] Pull changes from GitHub → update project
- [ ] Branch management (main, dev, feature branches)
- [ ] Conflict resolution UI

### Step 6.3 — Commit History
- [ ] Show commit log in editor sidebar
- [ ] Restore to previous commit
- [ ] Diff viewer (before/after)

---

## PHASE 7: Deployment Engine
**Duration: Week 9**
**Goal: One-click deploy to multiple providers**

### Step 7.1 — Lovable Cloud (Built-in)
- [ ] Assign subdomain: `{project-slug}.lifemarkai.app`
- [ ] Build pipeline (install deps → build → deploy static)
- [ ] HTTPS auto-configuration
- [ ] CDN integration

### Step 7.2 — External Providers
- [ ] Vercel adapter (via Vercel API)
- [ ] Netlify adapter (via Netlify API)
- [ ] Railway adapter (for full-stack)
- [ ] Provider selection UI

### Step 7.3 — Custom Domains
- [ ] Domain connection wizard
- [ ] DNS configuration guide
- [ ] SSL certificate provisioning
- [ ] Domain verification status

### Step 7.4 — Deployment Dashboard
- [ ] Deployment history
- [ ] Status indicators (building, live, failed)
- [ ] Environment variables management
- [ ] Rollback to previous deployment

---

## PHASE 8: Backend Integrations
**Duration: Week 10**
**Goal: Connect apps to real backend services**

### Step 8.1 — Supabase Integration Wizard
- [ ] Connect user's Supabase project (project URL + anon key)
- [ ] AI-assisted table creation from prompts
- [ ] Auto-generate CRUD code for tables
- [ ] Auth setup (email, Google, GitHub)
- [ ] Storage bucket management
- [ ] Real-time subscriptions

### Step 8.2 — Stripe Integration
- [ ] Connect Stripe account (API keys)
- [ ] Generate payment components (checkout, pricing table)
- [ ] Webhook handler generation
- [ ] Test mode vs. live mode toggle

### Step 8.3 — OpenAI / AI API Integration
- [ ] Add AI API keys to project env vars
- [ ] Generate AI-powered features (chatbot, search, etc.)
- [ ] Cost estimator

### Step 8.4 — Generic API Connector
- [ ] REST API explorer
- [ ] Auto-generate typed client from OpenAPI spec
- [ ] Environment variable manager

---

## PHASE 9: Real-Time Collaboration
**Duration: Week 11**
**Goal: Multiple users editing the same project simultaneously**

### Step 9.1 — Presence System
- [ ] Supabase Realtime channels per project
- [ ] Show who's online (avatars in top bar)
- [ ] Cursor position sharing in editor
- [ ] File lock indicators

### Step 9.2 — Collaborative Chat
- [ ] Shared chat history visible to all collaborators
- [ ] @mention teammates
- [ ] Comment threads on code lines

### Step 9.3 — Roles & Permissions
- [ ] Owner / Editor / Viewer roles
- [ ] Invite by email
- [ ] Remove collaborator
- [ ] Transfer ownership

---

## PHASE 10: Voice Mode & Image Generation
**Duration: Week 12**
**Goal: Advanced AI interaction modes**

### Step 10.1 — Voice Mode
- [ ] Browser-based speech-to-text (Web Speech API or Whisper)
- [ ] Voice recording UI (waveform animation)
- [ ] Transcription → prompt → execute
- [ ] Text-to-speech for AI responses (optional)

### Step 10.2 — Image Generation
- [ ] Prompt-based image generation (DALL-E 3 / Stable Diffusion)
- [ ] Transparent background support
- [ ] Auto-insert into project assets
- [ ] Image library / asset manager

---

## PHASE 11: Credit System & Monetization
**Duration: Week 13**
**Goal: Full billing and credit management**

### Step 11.1 — Credit Engine
- [ ] Credit deduction per AI action (configurable)
- [ ] Credit balance in UI (real-time)
- [ ] Low credit warnings
- [ ] Credit history log

### Step 11.2 — Stripe Billing
- [ ] Subscription plans (Free, Pro $25/mo, Business $50/mo, Enterprise)
- [ ] One-time credit top-ups
- [ ] Stripe Billing Portal integration
- [ ] Invoice history
- [ ] Usage-based billing for enterprises

### Step 11.3 — Plan Limits
| Plan | Credits | Private Projects | Collaborators | Custom Domains |
|---|---|---|---|---|
| Free | 5/day | ❌ | 3 | ❌ |
| Pro ($25/mo) | 100/mo | ✅ | 10 | 1 |
| Business ($50/mo) | 300/mo | ✅ | 20 | 5 |
| Enterprise | Unlimited | ✅ | Unlimited | Unlimited |

---

## PHASE 12: Template Marketplace
**Duration: Week 14**
**Goal: Starter templates users can fork**

### Step 12.1 — Template System
- [ ] Template schema (name, description, category, preview, files)
- [ ] Admin template creation interface
- [ ] Template categories (SaaS, Landing Page, Dashboard, E-commerce, Blog)

### Step 12.2 — Marketplace UI
- [ ] Browse templates grid
- [ ] Preview template (live demo)
- [ ] Fork to new project
- [ ] Community templates (user-submitted)
- [ ] Featured / trending templates

---

## PHASE 13: Analytics & Admin
**Duration: Week 15**
**Goal: Usage analytics and admin tools**

### Step 13.1 — Project Analytics
- [ ] Page views, visitor counts per deployed app
- [ ] AI usage stats (tokens, credits per project)
- [ ] Build/deploy success rates

### Step 13.2 — Admin Dashboard
- [ ] User management (ban, adjust credits, change plan)
- [ ] Revenue metrics (MRR, churn, signups)
- [ ] System health (AI API status, DB health)
- [ ] Audit logs (all user actions)

---

## PHASE 14: Enterprise Features
**Duration: Week 16**
**Goal: Enterprise-grade security and compliance**

### Step 14.1 — SSO Integration
- [ ] SAML 2.0 support
- [ ] OIDC support
- [ ] Okta, Azure AD, Google Workspace connectors

### Step 14.2 — Security & Compliance
- [ ] Audit logging (all actions timestamped)
- [ ] Data export (GDPR)
- [ ] Data deletion (right to be forgotten)
- [ ] IP allowlisting
- [ ] Custom data residency options

### Step 14.3 — API Access
- [ ] REST API for project management
- [ ] API key management
- [ ] Webhook support (deploy events, AI events)
- [ ] API rate limiting

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State Management | Zustand + React Query (TanStack) |
| Animations | Framer Motion |
| Code Editor | Monaco Editor |
| AI SDK | Vercel AI SDK |
| AI Models | OpenAI GPT-4o, Anthropic Claude, Google Gemini |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Real-time | Supabase Realtime |
| Storage | Supabase Storage |
| Payments | Stripe |
| GitHub Integration | Octokit.js |
| Email | Resend |
| Deployment | Vercel (platform) |
| Image Generation | OpenAI DALL-E 3 |
| Voice | Web Speech API + OpenAI Whisper |
| Icons | Lucide React |

---

## File Structure

```
lifemarkai/
├── app/
│   ├── (marketing)/          # Landing page, pricing, about
│   │   ├── page.tsx
│   │   └── pricing/page.tsx
│   ├── (auth)/               # Login, signup, onboarding
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/          # Protected: dashboard, settings
│   │   ├── dashboard/page.tsx
│   │   └── settings/page.tsx
│   ├── editor/[projectId]/   # Main editor experience
│   │   └── page.tsx
│   ├── templates/            # Template marketplace
│   ├── admin/                # Admin panel
│   └── api/                  # API routes
│       ├── ai/route.ts
│       ├── projects/route.ts
│       ├── deploy/route.ts
│       └── github/route.ts
├── components/
│   ├── ui/                   # shadcn/ui components
│   ├── editor/               # Editor-specific components
│   ├── chat/                 # Chat UI components
│   ├── preview/              # Preview iframe + overlay
│   ├── dashboard/            # Dashboard components
│   └── marketing/            # Landing page components
├── lib/
│   ├── ai/                   # AI provider abstraction
│   ├── supabase/             # Supabase client + types
│   ├── github/               # GitHub API helpers
│   ├── stripe/               # Stripe helpers
│   └── utils/                # General utilities
├── stores/                   # Zustand stores
├── types/                    # TypeScript types
├── hooks/                    # Custom React hooks
└── supabase/
    └── migrations/           # DB migration files
```

---

## Development Order (Recommended Execution)

1. **Phase 1** → Foundation (auth + DB + UI shell)
2. **Phase 2** → AI Chat + basic code generation (core value)
3. **Phase 4** → Editor + file system (make it usable)
4. **Phase 3** → Agent mode (power feature)
5. **Phase 5** → Visual edit (differentiation)
6. **Phase 7** → Deployment (end-to-end flow works)
7. **Phase 8** → Backend integrations (Supabase wizard)
8. **Phase 6** → GitHub sync (developer appeal)
9. **Phase 9** → Collaboration (team feature)
10. **Phase 11** → Credits + billing (monetization)
11. **Phase 10** → Voice + image gen (advanced AI)
12. **Phase 12** → Templates (growth)
13. **Phase 13** → Analytics (data)
14. **Phase 14** → Enterprise (scale)
