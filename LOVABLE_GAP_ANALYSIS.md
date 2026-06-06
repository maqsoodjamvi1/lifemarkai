# LifemarkAI vs Lovable.dev — Gap Analysis

> **Date:** May 2026  
> **Purpose:** Feature-by-feature comparison to identify what Lovable has that LifemarkAI is missing, prioritized by user impact.

---

## Legend
- ✅ **Has it** — fully implemented
- 🟡 **Partial** — exists but incomplete vs Lovable
- ❌ **Missing** — not implemented
- 🔴 **High priority** — significant user impact
- 🟠 **Medium priority** — meaningful but not critical
- 🟢 **Low priority** — nice to have / niche

---

## 1. Editor & Build Interface

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| AI chat with streaming | ✅ | ✅ | — |
| File tree / code view | ✅ | ✅ | — |
| Monaco code editor | ✅ | ✅ | — |
| Live preview (iframe) | ✅ | ✅ | — |
| Diff view (before/after) | ✅ | ✅ | — |
| ReAct autonomous agent | ✅ | ✅ | — |
| Plan mode (architecture first) | ✅ | ✅ | — |
| Image generation (DALL-E) | ✅ | ✅ | — |
| **Prompt queue** — queue/reorder/pause prompts while agent works | ❌ | ✅ | 🔴 |
| **Agent clarifying questions** before building | ❌ | ✅ | 🔴 |
| **Draw on images** before sending to agent (annotate screenshots) | ❌ | ✅ | 🟠 |
| **File-to-app conversion** — drop any file, AI converts it to an app | ❌ | ✅ | 🟠 |
| **Generate downloadable files in chat** (PDF/Excel/PPT) without touching project | ❌ | ✅ | 🟠 |
| **Mermaid diagram rendering** in chat | ❌ | ✅ | 🟠 |
| **Edit history with screenshot previews** | ❌ | ✅ | 🟠 |
| **"Better reverts"** — edit past messages, explore branches | ❌ | ✅ | 🔴 |
| **Browser agent testing** — real browser in virtual environment | ❌ | ✅ | 🔴 |
| **Desktop notifications** for long builds | ❌ | ✅ | 🟢 |

---

## 2. AI Models

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| GPT-4o | ✅ | ✅ | — |
| Claude (Anthropic) | ✅ | ✅ | — |
| Gemini models | ❌ | ✅ | 🟠 |
| Model selector per prompt | 🟡 (provider only) | ✅ | 🟠 |

---

## 3. Deployment & Hosting

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| One-click deploy | ✅ | ✅ | — |
| Deploy status tracking | ✅ | ✅ | — |
| Custom domains | 🟡 (UI exists, DNS mgmt manual) | ✅ (full DNS management) | 🔴 |
| **App emails from own domain** (Lovable manages DNS/SPF/DKIM) | ❌ | ✅ | 🟠 |
| **Authentication emails from own domain** | ❌ | ✅ | 🟠 |
| **Lovable Cloud** — own hosted DB/auth (alternative to Supabase) | ❌ | ✅ | 🟠 |
| **TanStack Start / SSR** support for newly generated apps | ❌ | ✅ | 🟠 |
| **Database backup restoration** | ❌ | ✅ | 🟠 |
| **Cloud Storage management** (buckets, folders) | ❌ | ✅ | 🟢 |

---

## 4. Version Control & Collaboration

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| GitHub sync | ✅ | ✅ | — |
| Real-time collaboration (presence) | ✅ | ✅ | — |
| Project sharing with roles | ✅ | ✅ | — |
| **GitLab sync** | ❌ | ✅ | 🟠 |
| **Workspace invite links** (per-role, expiring) | ❌ | ✅ | 🟠 |
| **Nested folders** (up to 3 levels deep) | ❌ | ✅ | 🟠 |
| **Cross-project referencing** via @ mentions for AI context | ❌ | ✅ | 🔴 |
| **Lovable Inbox** — central feed for invites, updates, notifications | ❌ | ✅ | 🟢 |

---

## 5. Integrations & Connectors

### App Connectors (embed into your built apps)

| Connector | LifemarkAI | Lovable | Priority |
|-----------|-----------|---------|----------|
| Stripe payments | ✅ | ✅ | — |
| Supabase | ✅ | ✅ | — |
| **Shopify** | ❌ | ✅ | 🟠 |
| **ElevenLabs** (voice AI) | ❌ | ✅ | 🟠 |
| **Twilio** (SMS/voice) | ❌ | ✅ | 🟠 |
| **Airtable** | ❌ | ✅ | 🟠 |
| **Slack** | ❌ | ✅ | 🟠 |
| **Linear** | ❌ | ✅ | 🟢 |
| **Resend** (email) | ✅ | ✅ | — |
| **Plaid** (banking) | ❌ | ✅ | 🟢 |
| **Sentry** (error monitoring) | ❌ | ✅ | 🟠 |
| **PostHog** (analytics) | ❌ | ✅ | 🟠 |
| **Amplitude** (analytics) | ❌ | ✅ | 🟢 |
| **Google Analytics** | ❌ | ✅ | 🟠 |
| **Mapbox** | ❌ | ✅ | 🟢 |
| **Cloudinary** (media) | ❌ | ✅ | 🟢 |
| **Semrush** (SEO research) | ❌ | ✅ | 🟢 |
| **Google Search Console** | ❌ | ✅ | 🟢 |

### Chat / MCP Connectors (use in AI chat context)

| Connector | LifemarkAI | Lovable | Priority |
|-----------|-----------|---------|----------|
| **Jira MCP** | ❌ | ✅ | 🟠 |
| **Notion MCP** | ❌ | ✅ | 🟠 |
| **Linear MCP** | ❌ | ✅ | 🟢 |
| **Amplitude MCP** | ❌ | ✅ | 🟢 |
| **PostHog MCP** | ❌ | ✅ | 🟢 |
| **GitHub MCP** | 🟡 (REST API) | ✅ (MCP) | 🟢 |
| **Supabase MCP** | ❌ | ✅ | 🟠 |
| **Figma MCP** | ❌ | ✅ | 🟠 |

---

## 6. Security & Auth

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| SSO (SAML/OIDC) | ✅ | ✅ | — |
| SCIM provisioning | ✅ | ✅ | — |
| Security center | ✅ | ✅ | — |
| Audit logs | ✅ | ✅ | — |
| 2FA | ❌ | ✅ | 🔴 |
| **Google/Apple OAuth for apps users build** | ❌ | ✅ | 🔴 |
| **SAML for apps users build** | ❌ | ✅ | 🟠 |
| **Aikido pen testing** integration | ❌ | ✅ | 🟠 |
| **Wiz SCA/SAST** integration | ❌ | ✅ | 🟢 |

---

## 7. Analytics & Insights

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| Usage analytics dashboard | ✅ | ✅ | — |
| Credit tracking | ✅ | ✅ | — |
| **Real-time analytics** — live visitor counts, pageviews, bounce rate for built apps | ❌ | ✅ | 🔴 |
| **Sort projects by popularity** (visitor count) | ❌ | ✅ | 🟢 |

---

## 8. Workspace & Project Management

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| Projects dashboard | ✅ | ✅ | — |
| Templates marketplace | ✅ | ✅ | — |
| Team management | ✅ | ✅ | — |
| **Workspace Knowledge** — shared rules/conventions injected into all projects | ❌ | ✅ | 🔴 |
| **Workspace Skills** — reusable named markdown playbooks | ❌ | ✅ | 🔴 |
| **Profile visibility** (public/private toggle) | ❌ | ✅ | 🟢 |

---

## 9. Payments & Credits

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| Stripe subscriptions | ✅ | ✅ | — |
| Credit system | ✅ | ✅ | — |
| Billing portal | ✅ | ✅ | — |
| **Auto top-up** for credits when balance runs low | ❌ | ✅ | 🟠 |
| **Gift cards** | ❌ | ✅ | 🟢 |
| **Student discounts** | ❌ | ✅ | 🟢 |
| **Lovable bonuses** (referral/loyalty credits) | ❌ | ✅ | 🟢 |

---

## 10. Platform & Clients

| Feature | LifemarkAI | Lovable | Priority |
|---------|-----------|---------|----------|
| Web app | ✅ | ✅ | — |
| **Mobile app** (iOS/Android) | ❌ | ✅ | 🔴 |
| **Desktop app** (macOS native) | ❌ | ✅ | 🟠 |
| **Lovable MCP server** — external tools can control Lovable | ❌ | ✅ | 🟠 |
| **Telegram integration** | ❌ | ✅ | 🟢 |
| **ChatGPT integration** | ❌ | ✅ | 🟢 |

---

## Priority Summary

### 🔴 High Priority Gaps (build these next)

1. **Prompt queue** — let users queue prompts while agent is working; critical UX for power users
2. **Agent clarifying questions** — agent asks questions before building to reduce wasted builds
3. **"Better reverts" / branch exploration** — edit past messages, explore alternate histories
4. **Browser agent testing** — AI tests your app in a real browser autonomously
5. **Cross-project referencing** — @ mention other projects for AI context
6. **Workspace Knowledge** — inject shared rules into every project (coding standards, branding, etc.)
7. **Workspace Skills** — reusable playbooks (e.g., "add auth", "add dark mode")
8. **Real-time analytics** — live visitor counts for deployed apps
9. **2FA** — two-factor authentication for workspace accounts
10. **Google/Apple OAuth for built apps** — let users' apps use social login
11. **Custom domain DNS management** — fully automated vs current manual flow
12. **Mobile app** — build and iterate on the go

### 🟠 Medium Priority Gaps

- Draw on images before sending to agent
- File-to-app conversion
- Generate downloadable files in chat (PDF/Excel/PPT)
- Mermaid diagram rendering
- Edit history with screenshot previews
- GitLab sync
- Workspace invite links (expiring, per-role)
- Nested folders (3 levels)
- Gemini model support
- App email / auth email from own domain
- Auto top-up for credits
- Key app connectors: Shopify, ElevenLabs, Twilio, Airtable, Slack, Sentry, PostHog, Google Analytics
- Key MCP connectors: Jira, Notion, Supabase MCP, Figma
- Aikido pen testing integration
- Desktop app
- Lovable MCP server
- SAML for built apps
- Database backup restoration
- Lovable Cloud (own DB/auth hosting)

### 🟢 Low Priority Gaps

- Desktop notifications for long builds
- Sort projects by popularity
- Profile visibility toggle
- Gift cards / student discounts / loyalty credits
- Telegram / ChatGPT integrations
- Wiz SCA/SAST
- Plaid, Mapbox, Cloudinary, Linear, Semrush, Google Search Console connectors
- Inbox / notification feed

---

## Recommended Roadmap

### Sprint 1 — Core UX (1–2 weeks)
1. Prompt queue UI with reorder/pause/cancel
2. Agent clarifying questions flow (before building, agent presents questions as cards)
3. Mermaid diagram rendering in chat (quick win, `mermaid` npm package)

### Sprint 2 — Power Features (2–3 weeks)
4. Edit history with screenshot previews + branch reverts
5. Workspace Knowledge (shared `.knowledge` file injected as system context)
6. Workspace Skills (named playbooks callable via `/skill-name`)

### Sprint 3 — Analytics & Auth (1–2 weeks)
7. Real-time app analytics (embed PostHog or Plausible in deployed apps)
8. 2FA for workspace accounts
9. Google/Apple OAuth scaffolding for built apps

### Sprint 4 — Integrations (2–4 weeks)
10. 5 high-value app connectors: Shopify, Slack, Airtable, Sentry, PostHog
11. 3 MCP connectors: Jira, Notion, Supabase MCP
12. GitLab sync (alongside existing GitHub)

### Sprint 5 — Platform (3–6 weeks)
13. Mobile app (React Native or PWA)
14. Browser agent testing (Playwright in sandbox)
15. Cross-project referencing via @ mentions

---

*Generated by gap analysis comparing Lovable.dev changelog (1,561 lines, May 2026) against LifemarkAI codebase (D:\Projects\lifemarkai).*
