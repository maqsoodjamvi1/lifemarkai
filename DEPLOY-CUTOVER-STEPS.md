# Deploy: Next.js → TanStack Start cutover

**Written:** 27 July 2026
**What this ships:** production stops serving the Next.js app and starts serving
`migration/tanstack-start-app`.

Run every command from `D:\Projects\lifemarkai` in **PowerShell or Git Bash on
Windows** — not from the Cowork sandbox. The sandbox mount serves truncated
copies of files edited during a session, so committing from there would commit
corrupted files.

---

## Why this is a cutover, not a normal deploy

| | committed `master` (live now) | your working tree (about to ship) |
|---|---|---|
| `Dockerfile` CMD | `npm run start` (Next.js) | `node migration/tanstack-start-app/scripts/start-production.mjs` |
| `package.json` `build` | `next build` | `npm run build --prefix migration/tanstack-start-app` |
| `next` dependency | `16.2.6` | **removed** (survives only in `overrides`) |

`master` is `b53e629` (8 July). Your branch `codex/security-hardening` is
`4360ab0` (23 July), 8 commits ahead and already on GitHub. On top of that sit
371 uncommitted files, including the entire untracked `migration/` app.

---

## Step 0 — clear the stale git lock

A 0-byte `.git/index.lock` from 26 July 22:00 is blocking every git command.
It's the leftover from a `git rm` that crashed in an earlier session; nothing is
holding it now.

```powershell
del .git\index.lock
```

## Step 1 — confirm the junk is excluded

I already added these to `.gitignore`. Verify before staging, because
`.tmp-docker-installer.exe` is **117 MB** and GitHub hard-rejects any single
file over 100 MB — without this the push fails outright, after uploading
everything else.

```powershell
git status --porcelain | Select-String "tmp-docker"
```

Expect **no output**. If anything appears, stop and re-check `.gitignore`.

Also confirm no secrets are staged — this must print nothing:

```powershell
git status --porcelain | Select-String "\.env"
```

(`migration/tanstack-start-app/.env.local` is covered by that app's own
`.gitignore:13`. I verified this with `git check-ignore`.)

## Step 2 — stage and commit everything

```powershell
git add -A
git status --short | Measure-Object -Line     # sanity: expect ~1,400 files
git commit -m "feat: cut production over to TanStack Start

Dockerfile and root package.json now build and run
migration/tanstack-start-app. Adds the previously untracked migration app,
the Docker-based self-hosted preview sandbox provider, and migration 155
widening the projects.framework constraint to accept tanstack-start."
```

The file count is large (~1,030 of them are the migration app, which has never
been committed). That is expected.

## Step 3 — merge to master and push

Coolify deploys `master`, so the branch alone changes nothing.

```powershell
git checkout master
git merge codex/security-hardening
git push origin master
```

If the merge reports conflicts, stop and tell me — do not force anything.

## Step 4 — apply migration 155 to Supabase

Do this **before** the rebuild finishes, or new project inserts will be rejected
by the old CHECK constraint.

Supabase dashboard → project **Lifemarkai** (`trthplzvzmmtorfrjiby`) → SQL Editor
→ paste `supabase/migrations/155_framework_tanstack_start.sql` → Run.

> **Gotcha:** the `drop constraint` line makes Supabase show a
> *"Potential issue detected — destructive operations"* modal. You must click
> **Run query** *inside that modal*. If you don't, it silently does nothing and
> the success toast you see is stale from a previous statement.

Verify it applied:

```sql
select pg_get_constraintdef(oid)
from pg_constraint
where conname = 'projects_framework_check';
```

Expect `tanstack-start` in the output.

## Step 5 — tell me, and I'll take it from here

Once `git push origin master` succeeds I will:

1. Force-rebuild in Coolify (**Advanced → Force deploy (without cache)** — a
   plain redeploy reports "build skipped / cached image" and silently ships
   nothing new).
2. Confirm the import log shows the new commit SHA and
   "Building docker image completed".
3. Verify lifemarkai.com actually serves the new build.

---

## Rollback

If the new container misbehaves, redeploy the previous commit from Coolify's
deployment history. A *failed* build is self-protecting: Coolify keeps the old
container running, so a broken build costs a cycle, not an outage.

To go back to Next.js in git:

```powershell
git revert -m 1 <merge-commit-sha>
git push origin master
```

---

## Known-unverified before this ships

You chose to let Coolify's build be the test, so these are open risks:

- **The production build has never been run.** I could not run it in the
  sandbox: your `node_modules` is Windows-native (esbuild's binary won't execute
  on Linux), and a clean Linux `npm ci` can't finish inside the 45-second call
  cap. If you want to close this cheaply first:
  `cd migration\tanstack-start-app; npm run build`
- **`app/` is still present** but nothing builds it any more — dead weight in
  the image, not a failure.
- **The Docker preview sandbox needs its SSH tunnel** to reach the VPS daemon:
  `ssh -N -L 2375:/var/run/docker.sock root@187.124.118.56`. Without it,
  `SANDBOX_PROVIDER=docker` has no daemon to talk to.
- **Previews are served over `http://IP:PORT`.** Once the editor is on HTTPS,
  browsers block them as mixed content and show a blank pane with no console
  error. `mixedContentWarning()` detects the mismatch; the real fix is a TLS
  proxy in front of the sandbox port range.
