# Ship & Watch — deploy runbook (steps 1 + 4)

## A. Before deploying lifemarkai.com

Production environment rules (the same traps that caused the local error loop):

- [ ] **NO Modal tokens** — remove/comment `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` in the production env, or previews route to the exhausted Modal account and fail. `SANDBOX_PROVIDER` can stay `docker` (falls through safely when Docker isn't set up) or be left unset.
- [ ] `NEXT_PUBLIC_APP_URL=https://lifemarkai.com` — the LifemarkData SDK uses it to find the app-data API.
- [ ] Database migrations **171 (app_data)** and **172 (panel_opens)** — both already applied to production ✔.
- [ ] `git push` done, then run the usual `deploy*.bat` flow to rebuild the Docker image.

## B. After deploying — the 10-project test plan

Create these personally, in order. Each tests a different path; fix only what actually breaks.

| # | Prompt | Expect |
|---|--------|--------|
| 1 | "landing page for a bakery" | static, instant preview |
| 2 | "portfolio website for a photographer" | static, instant |
| 3 | "ERP for wholesale inventory" | static SPA: sidebar, screens, seeded data |
| 4 | "CRM with a deal pipeline" | static SPA, kanban, LifemarkData persistence |
| 5 | "POS for a small restaurant" | static SPA |
| 6 | (on #4) "add a contact form that saves submissions" | uses LifemarkData, works in preview |
| 7 | (on #4) "add user login and roles" | AI does NOT fake a login — explains the full-stack upgrade |
| 8 | (on #4) "upgrade to full-stack" | project converts to tanstack-start, rebuilds |
| 9 | "app with user accounts and Stripe payments" | tanstack-start from the start, WebContainer preview boots |
| 10 | Publish #3, open the public URL, add a record, check `app_data` table | row appears in Supabase |
| 11 | (on #4) DB panel → connect a test Supabase account (see docs/backend-strategy.md §onboarding) → "store customers in my database" | AI uses the connected Supabase, rows in client DB |
| 12 | (on #4, before org ID is set) "upgrade to full-stack" | AI declines gracefully: "coming soon", stays static |

Also verify while testing: console stays clean (extension noise aside), the amber
"demo-grade storage" note shows in the Publish panel for static apps, and after a
day of use `SELECT panel, count(*) FROM panel_opens GROUP BY 1 ORDER BY 2 DESC;`
returns data.

## C. Step 4 — infrastructure, ONLY when growth demands

- **WebContainer license**: before charging customers, check StackBlitz's current
  terms at https://webcontainers.io — free for personal/open-source/dev;
  commercial production use requires their license (far cheaper than Modal).
- **Docker previews**: when you want deploy-parity previews, a $5–10 VPS +
  `SANDBOX_PROVIDER=docker` + `SANDBOX_PUBLIC_HOST=<vps-ip>` activates the
  self-hosted engine already in the codebase (`lib/sandbox/docker.ts`). Run it on
  a SEPARATE box from the one holding your database keys (its own header comment
  explains why).
- **Modal**: never, unless someone else is paying.

## D. Panel-usage review (in ~30 days)

```sql
SELECT panel, count(*) AS opens, count(DISTINCT user_id) AS users
FROM panel_opens
WHERE created_at > now() - interval '30 days'
GROUP BY panel ORDER BY opens DESC;
```
Panels with ~zero opens after a month of real users → prune with data, like the 32 already removed.
