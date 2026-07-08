# Lovable vs LifemarkAI — Live Dashboard Comparison (July 2026)

> Built by walking Lovable's **authenticated dashboard** section-by-section (not marketing pages) on
> July 8 2026, cross-referenced against LifemarkAI's current codebase + this session's builds. Every
> Lovable row below reflects what's actually in the product UI and how it's gated by plan tier.

## Plan tiers & pricing (the gating map)

Lovable gates features hard by tier — this is the most useful strategic intel from the walk:

| Plan | Price | Headline gated features |
|------|-------|--------------------------|
| **Free** | $0 | 5 daily build credits (reset midnight UTC), builds only |
| **Pro** | $25/mo | 100 credits, **credit rollovers**, on-demand top-ups, **unlimited lovable.app domains**, **custom domains**, **user roles & permissions**, remove badge, email support |
| **Business** | $50/mo | Team workspace, **RBAC**, internal publish, personal projects, **SSO**, **Security Center**, design templates, priority support |
| **Enterprise** | Volume + platform fee | **SCIM**, **audit logs**, **design systems**, **custom connectors**, publishing controls, sharing controls, volume credit pricing, dedicated support, onboarding |

Plus verticalized offers: Students (50% off), Campus, Kids (imagi partnership).

**Takeaway:** Lovable's moat isn't any single feature — it's a *fully built enterprise governance ladder*
already wired to Stripe tiers. LifemarkAI has many of the same features in code but no tier-gating/packaging.

## Dashboard & project management

| Area | Lovable (live) | LifemarkAI | Edge |
|------|----------------|------------|------|
| Home | Chat-to-build with **plan mode** toggle + **voice recording**; tabs: Search, My projects, Recently viewed, Shared with me, **Most visitors today**, Templates | Dashboard + project list; build prompt | **Lovable** (voice, analytics tab, richer org) |
| Project org | Folders, Starred, Created-by-me, Shared-with-me, per-project actions | Projects + nested groups (migration 062) | ~Even |
| Scale shown | 30+ projects in one workspace, real usage | — | n/a |

## Editor / build loop

| Area | Lovable (live) | LifemarkAI | Edge |
|------|----------------|------------|------|
| Layout | Preview / Files / Code / More tabs | Monaco editor + multi-panel (chat/plan/agent/git/live/image/db/env + 50 panels) | ~Even |
| Visual editing | Toolbar: **select elements, edit text inline, draw annotation, add comment** on live preview | VisualEditOverlay + WebContainer bridge (`veb-bridge`) | ~Even |
| Version history | View history, **bookmark in history**, **revert to version**, undo latest edit, per-message helpful/not-helpful | History panel + snapshots/restore | ~Even |
| Project monitoring | **Uptime/health monitoring** switch per project | — (no built-app uptime monitor) | **Lovable** |
| Publish | One-click Publish; block publish on critical security issues | Deploy (Coolify/Netlify) + publish-from-chat | ~Even |

## AI intelligence & knowledge

| Area | Lovable (live) | LifemarkAI | Edge |
|------|----------------|------------|------|
| Builder model | Lovable's own agent (single provider, not user-routable) | **Multi-model via OpenRouter** (catalog + prompt-aware cascade + cross-model escalation + model-aware prompting) | **LifemarkAI** |
| Workspace **Knowledge** | Custom instructions across all projects (coding style, libraries, tone/format) | System-prompt + editor-intelligence lenses; project knowledge | ~Even |
| **Skills** | Reusable agent instructions; **import from GitHub/URL**, `/` trigger or auto-activate, workspace-shared; built-ins: accessibility, redesign, seo-review, skill-creator, video-creator | Skills attach + editor-intelligence lenses + Titan roles | **Lovable** (import + built-in library + `/` UX) |
| **Design systems** | (Enterprise) promote a project to a design system so new builds inherit components + tokens | Curated design directions library | **Lovable** |
| Differentiated | Single strong agent | **Titan** multi-agent "AI software company" (10 roles, debate, CTO review) | **LifemarkAI** (if shipped) |

## Integrations, connectors & MCP

| Area | Lovable (live) | LifemarkAI | Edge |
|------|----------------|------------|------|
| Connectors | ~50 managed-OAuth connectors (docs) | **52** in registry + UI panel (this session) | ~Even on count; **Lovable** on managed OAuth |
| MCP | Remote MCP connectors (Business) + **local desktop MCP** (Business); governance toggles | MCP server (`/api/mcp`) unified to scoped `lmk_` keys (this session) + user MCP servers (migration 076) | ~Even |
| Messaging | **Telegram** chat-with-Lovable | Telegram link (migration 056) | ~Even |
| Public API | Documented, token-authed | `/api/v1/*` + docs (this session) | ~Even |

## Enterprise, security & governance (Lovable's widest lead)

| Area | Lovable (live) | LifemarkAI | Edge |
|------|----------------|------------|------|
| **SSO** | OIDC/SAML + domain verification (Business) | Settings page only — **no backend** | **Lovable** (real gap) |
| **SCIM** | User provisioning from IdP (Enterprise) | — | **Lovable** |
| **Security Center** | Workspace insights, code analysis, supply-chain, secrets overview, **security automation** | Built this session: scan + deps audit + scheduled scans + roll-up | ~Even (LifemarkAI now close) |
| **Audit logs** | Membership/project/security events (Enterprise) | Immutable append-only log + wiring (this session) | ~Even (LifemarkAI now close) |
| **PII / sensitive-data scanning** | Enterprise: on-demand scans of chat, Cloud DB, Cloud Storage + chat send-protection | Static PII scanner (`lib/security/scan.ts`) | **Lovable** (runtime data scanning, not just static) |
| **Publishing controls** | Who can publish externally, block publish on critical issues, require scan before first publish, allowed website access | Test/Live env lock (migration 046) | **Lovable** (granular) |
| **Sharing controls** | Preview-link sharing, code-download restriction, cross-project sharing (Enterprise) | Collaborators + roles | **Lovable** |
| **Access governance** | Restrict invites, workspace discovery, editor transfers, external-collaborator role caps, require-editor-role | Collaborators table + roles | **Lovable** (much deeper) |
| **Auto-fix security** | Workspace-level auto-remediation of low-risk scan issues | `health_findings` proposed_fix (approval-gated) | ~Even |
| Compliance | SOC 2 / ISO / GDPR (advertised) | Evidence-starter doc only | **Lovable** (certified) |

## Cloud / hosting / domains

| Area | Lovable (live) | LifemarkAI | Edge |
|------|----------------|------------|------|
| Managed backend | Lovable Cloud (Supabase-based); **default hosting region** (Business), micro+ instances | Lifemark Cloud (managed Supabase per app, tiers, backups, usage billing, regions) | ~Even |
| Domains | Buy/transfer via **Name.com** (registrar) + **IONOS** (partner) + **Entri** (connect existing); workspace-owned | Registrar abstraction + **Name.com driver + Entri connect** (this session) | ~Even (LifemarkAI now matches) |
| Block public storage | Toggle to prevent public buckets | — | **Lovable** |

## Distribution surfaces

| Area | Lovable (live) | LifemarkAI | Edge |
|------|----------------|------------|------|
| Desktop apps | **Native macOS (Apple Silicon + Intel) + Windows** downloads, local MCP | Electron scaffolding | **Lovable** (shipped) |
| Analytics | "Most visitors today" + per-project analytics | Analytics endpoint + beacon + panels (built) | ~Even |
| SEO/AEO | seo-review skill + Search Console + Semrush | Real SEO audit (this session) + AEO panel | ~Even |

## Honest bottom line

**Where LifemarkAI genuinely leads:** multi-model orchestration (real, differentiated), owned infra
(self-hosted + AI gateway), and the Titan multi-agent direction. On raw feature *presence*, this
session closed most of the parity gaps (52 connectors, audit immutability + security center pieces,
public API + MCP, real SEO/dep audits, Name.com + Entri domains).

**Where Lovable still clearly leads:**
1. **Enterprise governance is a fully-built, tier-packaged ladder** — SSO/SCIM working end-to-end,
   granular publishing/sharing/access controls, audit logs, PII runtime scanning, all wired to plan tiers.
   LifemarkAI has the *pieces* but no packaging and no working SSO backend.
2. **Compliance certs** (SOC 2 / ISO / GDPR) — operational, not code.
3. **Native desktop apps** shipped (mac + Windows) with local MCP.
4. **Design systems** + **skills import/library** + **project uptime monitoring** — polished, shipped.
5. **Managed OAuth** on connectors (users never touch keys) vs LifemarkAI's paste-a-token model.
6. **Maturity**: 30+ real projects in one workspace, credit rollovers, per-member credit limits,
   student/campus/kids verticals — a mature *platform*, not just a builder.

**The strategic gap isn't features — it's packaging + polish + trust.** LifemarkAI now matches Lovable
on most feature *checkboxes*, but Lovable has turned them into a tiered, governed, certified, multi-surface
platform. The highest-leverage next moves for LifemarkAI: (a) tier-gate the enterprise features that already
exist, (b) finish SSO end-to-end, (c) ship the desktop app, (d) start SOC 2 evidence collection.

---

## Deep-dive addendum (deeper walk, July 8)

Second pass, drilling into pages skimmed the first time. New specifics worth stealing:

### Account-level (per user)
- **Two-factor auth** (authenticator app *or* SMS) with re-auth-to-manage.
- **Public profiles** at `lovable.dev/@username` (public/private toggle) — a social/portfolio layer.
- **Showcase skills → Add to LinkedIn** (Beta): surface a Lovable-built skill on your LinkedIn. Growth loop.
- **Link company account** (personal SSO) separate from workspace SSO.
- Polish: **generation-complete sound**, chat suggestions toggle, auto-accept invitations, language selection.
- LifemarkAI has none of these (no 2FA UI, no public profiles, no LinkedIn loop).

### RBAC (People + Groups)
- Roles: **Owner / Editor / Collaborator**, per-member **credit limits** *and* per-member usage columns
  (July usage + total) right in the members table.
- **Groups** (Business): bundle users, assign members, manage access at group level.
- LifemarkAI: `collaborators` table + roles, but no per-member credit limits/usage UI, no groups.

### Project-level controls (per project, richer than expected)
- **Project monitoring** (Pro): recurring automated checks for issues/improvements, with past-check
  history + credit usage tracked. (LifemarkAI has self-verify but no scheduled per-project monitoring w/ history.)
- Live stats surfaced: **messages count, AI edits count**, created date.
- **Remix** (duplicate app), **public remixing** (anyone with link can copy), **transfer ownership**,
  **transfer workspace**, project category, **AI app context** opt-in (use AI-call context to debug),
  cross-project sharing, per-project auto-fix security, unpublish, disable analytics.

### In-editor build surface (the polish gap)
- Live preview with **in-editor Security panel**: shows an **issue count** and a **"Try to fix all"**
  button inline — one-click remediation right next to the preview. (LifemarkAI scans, but surfaces
  findings in a separate Security Center page, not inline with a fix-all.)
- **Public preview commenting**: "get comments on the preview… no Lovable account needed to comment" —
  stakeholder feedback without a seat. LifemarkAI has element comments (migration 058) but not anonymous
  public preview comments.
- Chat has **Build mode + plan mode + voice**; message-level bookmark-in-history / revert-to-version.
- Visual toolbar: select elements, edit text inline, draw annotation, add comment.

### Git & templates
- **Git**: GitHub **and** GitLab sync (LifemarkAI: GitHub sync live; GitLab now in the connector registry).
- **Templates** (Business): promote any project to a reusable **workspace template**; **Resources** is a
  curated public template/showcase gallery.

### Net new gaps this pass surfaced (all "polish/packaging", not core)
1. Inline "fix all security issues" in the editor (vs a separate page).
2. Anonymous public-preview commenting for stakeholder review.
3. Per-project scheduled monitoring with history.
4. Per-member credit limits + usage table; user groups.
5. Account 2FA, public `/@username` profiles, LinkedIn skill-showcase growth loop.
6. GitLab sync (near-parity — registry entry exists, needs the sync flow).

None of these change the strategic picture: LifemarkAI has the hard parts (multi-model, own infra, the
security/audit/domain/API machinery built this session). The delta is a long tail of **shipped polish +
tier packaging + social/growth loops** that Lovable has and LifemarkAI hasn't packaged yet.
