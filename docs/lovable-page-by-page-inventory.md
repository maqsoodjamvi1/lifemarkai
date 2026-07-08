# Lovable — Complete Page-by-Page Inventory (live walk, July 8 2026)

> Every page reachable in the authenticated Lovable app, walked one-by-one across three workspaces
> (Maqsood's = Free/owner, Batsie's = Pro/editor, Sasta's = Free). For each: purpose, plan-tier gate,
> and what actually renders. Access depends on **both** plan tier **and** role (Owner/Admin vs Editor
> vs Collaborator) — Editor-role accounts get admin pages redirected or blank even on a paid plan.

## Workspaces (switcher)
- **Batsie's Lovable** — Pro plan, 4 members (you are **Editor**). Workspace ID `moxG6pDx6Bnw1MUAHAg9`. "Payment issue" banner (reverts to Free if unresolved).
- **Maqsood's Lovable** — Free (you are **Owner**). "Upgrade to Pro" prompt.
- **Sasta's Lovable** — Free.
- `+ Create new workspace`.

## Dashboard (left nav + home)
| Page | URL | Contents |
|------|-----|----------|
| Home | `/dashboard` | Chat-to-build ("Got an idea, Maqsood?") with **Build/plan mode + voice**; "Connect all your tools" nudge; tabs: Search, My projects, Recently viewed, Shared with me, **Most visitors today** (analytics), Workspace templates, Lovable templates, Browse all; **Share Lovable — 100 credits per paid referral** |
| Resources | `/dashboard/resources` | Curated template/showcase gallery (e.g. "Editorial Dawn Wedding") |
| Connectors | `/dashboard?connectors=` | Managed-OAuth connector catalog (~50) |
| Projects | `/dashboard/projects` | All projects, folders, Starred, Created-by-me, Shared-with-me; per-project actions |

## Workspace / account settings (`/settings/*`)
| # | Page | URL | Gate | Renders |
|---|------|-----|------|---------|
| 1 | Account | `/settings/account` | — | **2FA** (authenticator/SMS), **public profile** `lovable.dev/@username` (public/private), **Showcase skill → Add to LinkedIn** (Beta), language, chat suggestions, **generation-complete sound**, auto-accept invitations, **linked accounts** (Google + "link company account" personal SSO), delete account |
| 2 | Devices & apps | `/settings/apps` | — | **Telegram** chat-with-Lovable; **native desktop apps** — macOS (Apple Silicon + Intel) + Windows, "local MCP support" |
| 3 | Workspace | `/settings/workspace` | — | Avatar, name, workspace ID, **workspace handle** (public profile page), leave/delete workspace |
| 4 | Plans & credit usage | `/settings/billing` | — | Free (5 daily credits) → **Pro $25** (rollovers, top-ups, custom domains, roles, remove badge) → **Business $50** (SSO, Security Center, RBAC, team workspace, internal publish, design templates) → **Enterprise** (SCIM, audit logs, design systems, custom connectors, publishing/sharing controls). Students 50%, Campus, Kids. Live: Batsie's = Pro / 3,000 credits |
| 5 | People | `/settings/people` | — | Roles **Owner / Editor / Collaborator**; **per-member credit limits** + July/total usage columns; invite link, invite members, filters |
| 6 | Groups | `/settings/groups` | **Business** | Organize users into groups; assign members; group-level access |
| 7 | Identity | `/settings/identity` | **Business** | **SSO** + **domain verification** + **provision users from IdP (SCIM)**. (Blank for Editor role) |
| 8 | Knowledge | `/settings/knowledge` | — | Workspace-wide custom instructions (coding style, preferred libraries/frameworks, tone/format) + project knowledge |
| 9 | Skills | `/settings/skills` | — | Reusable agent instructions; **import from GitHub/URL**; `/` trigger or auto-activate; workspace-shared; built-ins: accessibility, redesign, seo-review, skill-creator, video-creator |
| 10 | Templates | `/settings/templates` | **Business** | Promote projects to reusable **workspace templates** |
| 11 | Design systems | `/settings/design-systems` | **Enterprise** | Promote a project to a **design system** (new builds inherit components + tokens) |
| 12 | Connectors | `/settings?connectors=` | — | Connector catalog (managed OAuth) |
| 13 | Git | `/settings/git` | — | **GitHub + GitLab** sync |
| 14 | Workspace domains | `/settings/workspace-domains` | **Pro** | Buy / transfer-in domains (via Name.com + IONOS + Entri); workspace-owned. (Redirects to dashboard for Editor role) |
| 15 | Privacy & security | `/settings/privacy-security` | mixed | **Access** (restrict invites, discovery, editor transfers, external-collab caps, require-editor-role), **Publishing** (who can publish, block critical, require scan before first publish, app login methods), **Security automation** (auto-fix), **Sharing** (preview-link, code-download, cross-project), **MCP** (remote + local desktop toggles), **Data protection** (PII/sensitive-data scanning, data opt-out, block public buckets, default hosting region) |
| 16 | Security center | `/settings/security-center` | **Business** | Workspace insights, code analysis, supply-chain security, secrets overview, security automation. (Blank for Editor role) |
| 17 | Audit logs | `/settings/audit-logs` | **Enterprise** | Membership / project / security event trail. (Blank for Editor role) |

## Project settings (`/projects/:id/settings/*`)
Mirrors the workspace nav (account, apps, project, git, domains, workspace, billing, people, groups,
identity, knowledge, skills, templates, design-systems, connectors, workspace-domains, privacy-security,
security-center) **plus** the project Overview:
- Project name, URL subdomain, owner, created date, **messages count** (e.g. 213), **AI edits count** (e.g. 162)
- **Project monitoring** (Pro) — recurring automated issue/improvement checks with history + credit usage
- Public remixing, project category, **hide Lovable badge** (Pro)
- **Remix** (duplicate), **transfer workspace**, **transfer ownership**, disable analytics, **AI app context** opt-in, cross-project sharing, per-project auto-fix security, unpublish, delete

## Editor (per project)
- Tabs: **Preview / Files / Code / More**; desktop/mobile preview, page switcher, open-in-new-tab
- **Visual editing toolbar**: select elements, edit text inline, draw annotation, add comment
- **Version history**: view history, bookmark-in-history, revert-to-version, undo latest edit, per-message helpful/not-helpful
- **In-editor Security panel**: live issue count + **"Try to fix all"** (one-click remediation)
- **Public preview commenting** — "no Lovable account needed to comment"
- Chat: Build mode + plan mode + voice; **Publish**; **Share**

## Access-state notes (what actually gated during the walk)
- **Editor role (Batsie's Pro):** `workspace-domains` → **redirects to /dashboard**; `identity`,
  `security-center`, `audit-logs`, `privacy-security` → **blank** (the "Security & compliance" nav
  group is empty for Editors).
- **Tier badges visible even when locked:** Groups (Business), Templates (Business), Design systems (Enterprise).
- **Pro ≠ enterprise:** upgrading Free→Pro unlocks builder features (credits, custom domains, roles,
  rollovers, badge removal, project monitoring) — **not** SSO / Security Center / Audit Logs / SCIM /
  Design Systems, which stay behind Business/Enterprise.

## LifemarkAI status against this inventory (CORRECTED after code re-audit)

A code-level re-audit (July 8) overturned most of the "missing" list below — these were inventory
errors from comparing Lovable's live UI against incomplete knowledge of LifemarkAI's code. **Verified
already present in the codebase:**

| Feature | Evidence in repo |
|---------|------------------|
| Referral program | `supabase/migrations/037_referral_program.sql` (referrals table) |
| Member groups / RBAC groups | `051_member_groups.sql` (member_groups, member_group_members, project_group_access) + `016_project_groups.sql` |
| Per-member credit limits | `005_teams_and_credit_packs.sql` ("per-member allowance, NULL = unlimited") + `006` reset RPC |
| 2FA / MFA | `components/dashboard/two-factor-section.tsx`, `app/(auth)/mfa-challenge/page.tsx`, `security-settings-page.tsx` |
| Design systems | `components/editor/design-systems-panel.tsx`, `app/api/design-systems/route.ts` |
| Public profiles / visibility | `039_profile_visibility.sql` (username + public/private) |
| In-editor "fix all" | `vulnerability-panel.tsx`, `seo-panel.tsx` (fix-all wired) |
| Project monitoring | self-verify loop + `/api/health-scan` cron + `health_findings` (075) |
| Security Center / audit / connectors / domains / MCP / public API / SEO+dep audit / analytics / knowledge / skills | built (many this session) |

**So LifemarkAI already has feature parity or near-parity with Lovable in code.** Adding these again
would be duplication ("not more").

### Genuinely remaining — and NOT "code features to add"
1. **Working SSO/SCIM end-to-end** — needs a real IdP (Okta/Entra) in staging to wire + verify. Environment-coupled.
2. **Native desktop apps shipped** — Electron/Capacitor scaffolding exists; needs build + code-signing + store distribution (a release pipeline, not a code feature).
3. **SOC 2 / ISO / GDPR certification** — a months-long auditor process (evidence-starter doc written).
4. **Tier-gating / packaging** — Lovable gates features by Pro/Business/Enterprise; LifemarkAI has the features but may not paywall them. This is business config, buildable if desired.
5. **Anonymous public-preview comments** — element comments exist (058) but require auth; "no-account" preview commenting would be a small extension.

**Honest conclusion:** there is no large "missing features" build to do — LifemarkAI is at parity. The
remaining delta is operational (SSO infra, desktop distribution, compliance) plus packaging, not new features.
