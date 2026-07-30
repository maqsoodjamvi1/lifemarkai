# Steps 1–2 — Architecture lock (Jul 25 2026)

## Goal

Move LifemarkAI’s **framework shell** (routing, loaders, isomorphic UX, Vite HMR) to TanStack Start so the editor/canvas is fast and predictable — without rewriting UI styling or bundling user-generated preview code into the host app.

## Hard constraint (do not violate)

| Do | Don’t |
|----|-------|
| Run **Start alone** on `:3001` (APIs via native routes + in-process `app/api` adapter) | Require `next dev` / proxy-to-Next for the core launch path |
| Keep generated-app preview in **Modal sandbox / iframe** only | Let Vite HMR the user’s generated app inside the host bundle |
| Port pages → file routes + Zod search; unported HTTP via adapter | Big-bang rewrite of all `app/api` handlers into `createServerFn` |
| Use **Vite-native** `@tanstack/react-start` | Install **Vinxi** (legacy Start stack; obsolete for current Start) |

Full page/API mapping: [`ROUTE-MAP.md`](./ROUTE-MAP.md). Status: [`MIGRATION-STATUS.md`](./MIGRATION-STATUS.md) (**Start-only**).

---

## Step 1 — Route tree (summary)

```
__root
├── index (/)
├── pricing, templates, explore, docs, docs/$slug, changelog, connectors, demo, health
├── login, signup, forgot-password, reset-password, mfa-challenge
├── auth/callback                    # cookie exchange (native)
├── _dashboard (layout)
│   ├── dashboard
│   ├── dashboard/projects|billing|analytics|team|people|inbox|…
│   └── dashboard/settings/…
├── editor/$projectId                # WORKSPACE / CANVAS (Zod search — Step 3)
├── invite/$token, accept-invite
├── api/$                            # in-process adapter → app/api/** handlers
├── preview/$, preview-by-slug/$     # in-process adapter (no Next process)
└── u/$username, p/$username/$projectSlug, app/$slug
```

Status per page: see ROUTE-MAP checklist (public share pages ✅).

---

## Step 2 — Dependencies & tooling (this package only)

### Stack (current, correct)

| Package | Role |
|---------|------|
| `@tanstack/react-start` | SSR + server functions + Vite plugin |
| `@tanstack/react-router` | typed file routes |
| `vite` + `@vitejs/plugin-react` | bundler / HMR |
| `zod` + `@tanstack/zod-adapter` | `validateSearch` schemas |
| `react` / `react-dom` 18 | UI |

### Explicitly excluded

| Package | Why |
|---------|-----|
| `next` | Lives only in **repo root** until cutover |
| `vinxi` | Superseded; Start is Vite-plugin based now |
| `@webcontainer/api` in host | Preview stays Modal/iframe-isolated |

### Scripts

```json
{
  "dev": "vite dev --port 3001",
  "build": "vite build",
  "start": "node .output/server/index.mjs",
  "type-check": "tsc --noEmit"
}
```

### Single-process boot (Start-only)

```bash
cd migration/tanstack-start-app && npm run dev   # → :3001 (UI + APIs)
```

Env: `VITE_APP_URL=http://localhost:3001`, `VITE_SUPABASE_*` (+ AI/Modal/Stripe as needed).  
`VITE_NEXT_ORIGIN` is optional legacy only — not required for core `/api`. Root scripts may be flipped to Start by a parallel cutover agent.

### Preview isolation rule

Host app (`:3001`) never imports or transforms user project files as app modules.  
Preview = postMessage + Modal sandbox / iframe (`/api/projects/:id/sandbox-preview*` via native Start handlers and/or in-process adapter).  
That preserves “instant host HMR” while generated apps stay sandboxed.

---

## Steps 3–4 — Done (Jul 25)

3. **Workspace route** — `src/lib/editor-search.ts` + Zod `validateSearch` on `editor/$projectId` (`prompt`, `mode`, `deploy`, `file`, `view`, `panel`, `version`). Shell + `EditorLayout` honor deep-links; file/view updates use typed `navigate({ search })`.
4. **AI** — SSE: explicit `src/routes/api/ai/chat.ts` + `agent.ts` (`dispatchAppApi` → in-process `app/api` handler). JSON: `createServerFn` in `src/lib/server-fns/ai-json.ts`. Client: `src/lib/ai-stream-client.ts`.

5. **Public share** — `/u/$username`, `/p/$username/$projectSlug`, `/app/$slug` via `src/lib/public-server.ts` + file routes.

6–14. **Native + adapter cutover** — projects/files/messages/credits GET/skills/deploy status/comments/telemetry/snapshots/env owned as native Start routes; remaining HTTP (including `/api/ai/fix`, `POST /api/deploy`, webhooks) via `api/$` adapter or `dispatchAppApi`. See [`MIGRATION-STATUS.md`](./MIGRATION-STATUS.md).

Do **not** run `scripts/migrate-next-to-tanstack.mjs --write` on the live Next tree until sole-app Coolify cutover is intentional.
