# Step 1 — Next.js → TanStack Router route map

**Source of truth:** `app/**` in repo root (Next.js 16 App Router)  
**Target tree:** `migration/tanstack-start-app/src/routes/**`  
**Generated tree:** `src/routeTree.gen.ts` (Vite plugin; do not hand-edit)

Layouts / pathless groups in Next become TanStack **pathless layout routes** (`_marketing`, `_dashboard`, `_auth`) or a single `__root.tsx`.

---

## Layout mapping

| Next.js | TanStack Start |
|---------|----------------|
| `app/layout.tsx` | `src/routes/__root.tsx` |
| `app/(marketing)/layout.tsx` | optional `src/routes/_marketing.tsx` (pathless) — currently pages are top-level |
| `app/(dashboard)/layout.tsx` | `src/routes/_dashboard.tsx` |
| `app/(auth)/*` | top-level auth routes (no path segment) |
| `app/editor/[projectId]/layout.tsx` | fold into `editor/$projectId.tsx` or `editor.tsx` layout |

---

## Page routes (39 → file routes)

| Status | Next.js page | URL | TanStack file route |
|--------|--------------|-----|---------------------|
| ✅ | `(marketing)/page.tsx` | `/` | `index.tsx` |
| ✅ | `(marketing)/pricing/page.tsx` | `/pricing` | `pricing.tsx` |
| ✅ | `(marketing)/templates/page.tsx` | `/templates` | `templates.tsx` |
| ✅ | `(marketing)/explore/page.tsx` | `/explore` | `explore.tsx` |
| ✅ | `(marketing)/docs/page.tsx` | `/docs` | `docs.tsx` |
| ✅ | `(marketing)/docs/[slug]/page.tsx` | `/docs/:slug` | `docs/$slug.tsx` |
| ✅ | `(marketing)/changelog/page.tsx` | `/changelog` | `changelog.tsx` |
| ✅ | `(marketing)/connectors/page.tsx` | `/connectors` | `connectors.tsx` |
| ✅ | `(marketing)/u/[username]/page.tsx` | `/u/:username` | `u/$username.tsx` |
| ✅ | `(marketing)/p/[username]/[projectSlug]/page.tsx` | `/p/:username/:projectSlug` | `p/$username/$projectSlug.tsx` |
| ✅ | `demo/page.tsx` | `/demo` | `demo.tsx` |
| ✅ | `health/page.tsx` | `/health` | `health.tsx` |
| ✅ | `app/[slug]/page.tsx` | `/app/:slug` | `app/$slug.tsx` |
| ✅ | `(auth)/login/page.tsx` | `/login` | `login.tsx` |
| ✅ | `(auth)/signup/page.tsx` | `/signup` | `signup.tsx` |
| ✅ | `(auth)/forgot-password/page.tsx` | `/forgot-password` | `forgot-password.tsx` |
| ✅ | `(auth)/reset-password/page.tsx` | `/reset-password` | `reset-password.tsx` |
| ✅ | `(auth)/mfa-challenge/page.tsx` | `/mfa-challenge` | `mfa-challenge.tsx` |
| ✅ | `auth/callback/route.ts` | `/auth/callback` | `auth/callback.ts` (HTTP handler) |
| ✅ | `(dashboard)/dashboard/page.tsx` | `/dashboard` | `_dashboard/dashboard.tsx` |
| ✅ | `(dashboard)/dashboard/projects/page.tsx` | `/dashboard/projects` | `_dashboard/dashboard/projects.tsx` |
| ✅ | `(dashboard)/dashboard/billing/page.tsx` | `/dashboard/billing` | `_dashboard/dashboard/billing.tsx` |
| ✅ | `(dashboard)/billing/page.tsx` | `/billing` | `_dashboard/billing.tsx` → redirect billing |
| ✅ | `(dashboard)/dashboard/analytics/page.tsx` | `/dashboard/analytics` | `_dashboard/dashboard/analytics.tsx` |
| ✅ | `(dashboard)/dashboard/team/page.tsx` | `/dashboard/team` | `_dashboard/dashboard/team.tsx` |
| ✅ | `(dashboard)/dashboard/people/page.tsx` | `/dashboard/people` | `_dashboard/dashboard/people.tsx` |
| ✅ | `(dashboard)/dashboard/inbox/page.tsx` | `/dashboard/inbox` | `_dashboard/dashboard/inbox.tsx` |
| ✅ | `(dashboard)/dashboard/security/page.tsx` | `/dashboard/security` | `_dashboard/dashboard/security.tsx` |
| ✅ | `(dashboard)/dashboard/audit-logs/page.tsx` | `/dashboard/audit-logs` | `_dashboard/dashboard/audit-logs.tsx` |
| ✅ | `(dashboard)/dashboard/ai-evals/page.tsx` | `/dashboard/ai-evals` | `_dashboard/dashboard/ai-evals.tsx` |
| ✅ | `(dashboard)/dashboard/settings/page.tsx` | `/dashboard/settings` | `_dashboard/dashboard/settings.tsx` |
| ✅ | `…/settings/skills/page.tsx` | `/dashboard/settings/skills` | `…/settings/skills.tsx` |
| ✅ | `…/settings/sso/page.tsx` | `/dashboard/settings/sso` | `…/settings/sso.tsx` |
| ✅ | `…/settings/scim/page.tsx` | `/dashboard/settings/scim` | `…/settings/scim.tsx` |
| ✅ | `…/settings/workspace-knowledge/page.tsx` | `/dashboard/settings/workspace-knowledge` | `…/settings/workspace-knowledge.tsx` |
| ✅ | `…/settings/security/page.tsx` | `/dashboard/settings/security` | `…/settings/security.tsx` |
| ✅ | `…/settings/branding/page.tsx` | `/dashboard/settings/branding` | `…/settings/branding.tsx` |
| ✅ | `editor/[projectId]/page.tsx` | `/editor/:projectId` | `editor/$projectId.tsx` **(Workspace / Canvas)** |
| ✅ | `invite/[token]/page.tsx` | `/invite/:token` | `invite/$token.tsx` |
| ✅ | `accept-invite/page.tsx` | `/accept-invite` | `accept-invite.tsx` |

Legend: ✅ present in shell · ⬜ still to add (public share / slug apps)

---

## Workspace / Canvas search params (Step 3 target)

Next: `app/editor/[projectId]/page.tsx` reads loose `searchParams`.  
TanStack: `editor/$projectId.tsx` + **Zod `validateSearch`** (strict, client-instant).

| Param | Type | Purpose |
|-------|------|---------|
| `prompt` | `string?` | Starter / auto-build prompt |
| `mode` | `'plan' \| 'build' \| 'agent' \| 'chat'?` | AI mode |
| `deploy` | `string?` | Auto-deploy flag |
| `file` | `string?` | *(planned)* open file in code panel |
| `view` | `'preview' \| 'code' \| 'split'?` | *(planned)* canvas layout |
| `panel` | `string?` | *(planned)* left tool panel id |

**Step 3 done:** Zod via `@tanstack/zod-adapter` in `src/lib/editor-search.ts`; route uses `editorSearchValidator`.

---

## HTTP / edge surfaces (stay as routes, not pages)

| Next.js | URL | TanStack strategy |
|---------|-----|-------------------|
| `preview/[projectId]/route.ts` | `/preview/:projectId` | `preview/$.ts` → **proxy Next** (Phase A) → native later |
| `preview-by-slug/[slug]/route.ts` | `/preview-by-slug/:slug` | `preview-by-slug/$.ts` → proxy |
| `app/api/**/route.ts` (~206) | `/api/**` | `api/$.ts` → **proxy Next** (Phase A) |
| Stripe / SCIM / MCP / webhooks | same paths | Keep as **HTTP API routes** forever (not `createServerFn`) |

### API family map (for Step 4 slicing)

| Family | Approx. routes | Target |
|--------|----------------|--------|
| `api/ai/*` (chat, agent, plan, fix, stream…) | ~35 | `createServerFn` **or** streaming HTTP route (SSE must stay HTTP) |
| `api/projects/*` | ~70 | mix: UI → serverFn; sandbox/preview → HTTP |
| `api/billing/*`, webhooks | ~10 | HTTP (raw body) |
| `api/cloud/*` | ~15 | HTTP + cron |
| `api/github/*`, `api/deploy/*` | ~15 | HTTP |
| `api/integrations/*`, connectors | ~20 | HTTP (proxy auth) |
| other (keys, notifications, scim, mcp, v1…) | ~40 | HTTP |

**Streaming rule:** AI SSE endpoints (`/api/ai/chat`, `/api/ai/agent`, …) stay as **HTTP handlers** under `src/routes/api/ai/...` — `createServerFn` is for JSON RPC-style calls, not open SSE streams.

---

## Target directory layout (production-grade)

```
migration/tanstack-start-app/
  package.json              # Start + Vite (no Next, no Vinxi)
  vite.config.ts            # tanstackStart() + dual @/ for editor alias
  .env.local                # VITE_* only
  src/
    router.tsx
    routeTree.gen.ts        # generated
    routes/
      __root.tsx
      _dashboard.tsx
      _dashboard/dashboard/...
      editor/$projectId.tsx   # workspace canvas
      api/$.ts                # Phase A proxy; later replaced by real handlers
      preview/$.ts
      …
    lib/
      supabase/{client,server}.ts
      server-fns/             # Step 4: createServerFn modules
      preview/                # isolation helpers (iframe / Modal sandbox only)
    components/               # shell UI; EditorLayout via @lifemark/editor
```

---

## Navigation translation cheat-sheet

| Next.js | TanStack |
|---------|----------|
| `useRouter().push(href)` | `useNavigate()({ to: href })` or typed `to` + `params` |
| `usePathname()` | `useRouterState({ select: s => s.location.pathname })` |
| `useSearchParams()` | `Route.useSearch()` / `useSearch({ from })` |
| `useParams()` | `Route.useParams()` |
| `<Link href="/x">` | `<Link to="/x">` |
| `redirect()` / `notFound()` | `throw redirect()` / `throw notFound()` |
| `'use client'` / `'use server'` | **delete** (isomorphic by default) |
| `NEXT_PUBLIC_*` | `VITE_*` (+ define bridge while dual-running) |
