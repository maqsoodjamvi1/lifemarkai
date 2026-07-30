# LifemarkAI Platform → TanStack Start — Migration Kit

Honest scope first (measured Jul 24 2026 by `scripts/migrate-next-to-tanstack.mjs`):

| Surface | Count | How |
|---|---|---|
| `next/*` mechanical swaps (imports, `NextResponse.json`, `NextRequest`, `NEXT_PUBLIC_`) | ~314 files | **codemod, automatic** |
| API route handlers (`app/api/**/route.ts`) | **206** | manual/templated |
| `@/lib/supabase/server` (SSR-cookie auth) consumers | **235** | one adapter unblocks all |
| `generateMetadata`/`metadata` exports | 34 | manual → route `head` |
| async RSC pages | 14 | manual → loader + sync component |

This is a **multi-day, phased** migration, not a single edit — 206 route handlers + 235 auth consumers can't be converted correctly-and-verifiably in one pass, and each must be built-tested. Do it as a **strangler-fig**: stand up the TanStack Start app beside the Next.js one, migrate slice-by-slice behind the same DB, cut over when green. Never a big-bang rewrite of the live tree.

## Phase 0 — Foundation (do once)
1. New TanStack Start app (see `lib/templates/tanstack-start-scaffold.ts` for the exact files: `src/routes/__root.tsx`, `src/router.tsx`, `vite.config.ts` with `tanstackStart()`, tsconfig `@/*`).
2. Port the **Supabase auth adapter** (below) — this is the keystone: it keeps the `createClient()` call-site signature identical, so the 235 consumers change their *import path* only.

### Supabase server client for TanStack Start
```ts
// src/lib/supabase/server.ts  (drop-in for @/lib/supabase/server)
import { createServerClient } from "@supabase/ssr";
import { getWebRequest } from "@tanstack/react-start/server";
import { parseCookies, setCookie } from "@tanstack/react-start/server";

export function createClient() {
  const request = getWebRequest();
  return createServerClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          const c = parseCookies();
          return Object.entries(c).map(([name, value]) => ({ name, value }));
        },
        setAll(cookies) {
          for (const { name, value, options } of cookies) setCookie(name, value, options);
        },
      },
    },
  );
}
```
Then the codemod-adjacent step: rewrite `@/lib/supabase/server` → `@/lib/supabase/server` (same alias, new file) across the 235 files — they keep calling `const supabase = await createClient()`. `createAdminClient()` (service-role, no cookies) ports unchanged.

## Phase 1 — Mechanical sweep (automatic)
```bash
node scripts/migrate-next-to-tanstack.mjs            # dry-run report
node scripts/migrate-next-to-tanstack.mjs --write    # apply the 314-file swaps
```
Then hand-fix the handful the codemod flags inline (`next/image` TODO, any `usePathname` edge cases).

## Phase 2 — API routes (206) → server routes / server functions
Two targets depending on the caller:
- **Called from the app UI** (loaders/mutations) → `createServerFn`.
- **External webhooks / public API** (Stripe webhook, `/api/apps/:id/mcp`, connector-proxy) → TanStack Start **API routes** (`src/routes/api/*.ts` exporting a `Route` with `server` handlers) — keep them as HTTP endpoints.

Route-handler → server-fn pattern:
```ts
// BEFORE (Next.js): app/api/projects/[id]/mcp/route.ts
export async function POST(req: NextRequest, { params }) {
  const supabase = await createClient();
  const { id } = await params;
  const body = await req.json();
  return NextResponse.json({ ok: true });
}

// AFTER (TanStack Start): a server function
import { createServerFn } from "@tanstack/react-start";
export const projectMcp = createServerFn({ method: "POST" })
  .validator((d: { id: string; body: unknown }) => d)
  .handler(async ({ data }) => {
    const supabase = createClient();       // adapter above
    return { ok: true };
  });
```
Webhook/public endpoints stay HTTP: put them under `src/routes/api/…` as API routes (raw-body access for Stripe preserved).

## Phase 3 — Pages (39) → routes + loaders
```tsx
// BEFORE: app/dashboard/page.tsx (async RSC)
export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select();
  return <Dashboard projects={data} />;
}

// AFTER: src/routes/dashboard.tsx
export const Route = createFileRoute("/dashboard")({
  loader: async () => {
    const supabase = createClient();
    const { data } = await supabase.from("projects").select();
    return { projects: data };
  },
  head: () => ({ meta: [{ title: "Dashboard" }] }),   // ← generateMetadata
  component: Dashboard,
});
function Dashboard() {                                   // ← sync, not async
  const { projects } = Route.useLoaderData();
  return <DashboardView projects={projects} />;
}
```
`middleware.ts` (none here) → `beforeLoad` on `__root`/section routes for auth guards.

## Phase 4 — Verify (gating)
Per slice: `tsc --noEmit`, `vite build`, and boot the route. Only cut traffic over once the slice is green. Keep the Next.js app serving everything not yet migrated.

## Env
- `NEXT_PUBLIC_*` → `VITE_*` (codemod does the string swap; also rename the actual env vars).
- Deploy target changes (Next server → the TanStack Start Nitro output) — update the Coolify/VPS build + start commands last, at cutover.
