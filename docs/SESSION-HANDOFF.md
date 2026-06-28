# Session Handoff — Editor / Preview Fixes & Deploy Checklist

A single actionable record of what changed, what's live, what's pending, and the
exact steps to finish. Anyone (you, Codex, a teammate) can follow this without
further context.

---

## 1. What is LIVE on `master` (commit `c119464`, deployed)
- **Preview JSX transpiler fix** — `preset-typescript` now uses `allExtensions + isTSX`
  (was `ignoreExtensions:true`, which silently disabled JSX). Components render again.
- **Agent feed UI cleanup** — clean "Editing X" rows, deduped, no raw `write_file` spam.
- **Restyle fix** — restyle requests apply a new palette instead of preserving dark.
- **Default Build mode** + **36 starter templates** (marketing, ecommerce sub‑niches,
  admin/ERP) with **prompt‑based auto‑selection** (`pickStarterTemplate`).
- **Principal‑register Chat/Patch prompts** + operating‑discipline block + multi‑point
  find/replace patch nudge (`lib/ai/system-prompts.ts`).

## 2. What is STAGED but NOT yet pushed (in working tree only)
- **`lib/preview/build-fallback-html.ts`** — duplicate‑declaration fix: all generated
  module handles changed `const → var` (fixes `Identifier '__mod_...' has already been
  declared`), and `PREVIEW_ENGINE_REV` bumped to `22`.
- **`docs/preview-compiler-esbuild-plan.md`** — durable‑fix design (replace regex
  transpiler with esbuild‑wasm).
- **`docs/SESSION-HANDOFF.md`** — this file.

> Verified at source level; not yet runtime‑tested (sandbox was down at handoff).

## 3. SHIP IT — exact steps
Run in `D:\Projects\lifemarkai` (Codex / VS Code / Git Bash — uses your SSH key):

```bash
git add -A
git commit -m "preview: var module handles (fix duplicate-declaration crash) + rev 22; docs"
git push origin master        # deploys via Coolify (current pipeline)
```

Then watch Coolify rebuild and confirm the duplicate‑declaration crash is gone in a
project preview.

## 4. OPTIONAL — migrate repo to the TIMESoftSolution org
The remote is already added (`timesoft`). To move:
```bash
git push timesoft --all
git push timesoft --tags
```
Then:
1. `TIMESoftSolution/lifemarkai` → **Settings → Branches** → set default branch to **master**.
2. **Coolify** → app → **Configuration → Git Source** → point to
   `TIMESoftSolution/lifemarkai`; re‑add build env vars (NEXT_PUBLIC_SUPABASE_URL,
   NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY,
   RESEND_API_KEY, etc.); deploy; verify `lifemarkai.com` works.
3. Only **after** the new repo is verified green: archive (don't hard‑delete) the old
   `maqsoodjamvi1/lifemarkai` as a backup.

## 5. SECURITY — do this now
- **Revoke the GitHub PAT** that was pasted earlier in chat: GitHub → Settings →
  Developer settings → Personal access tokens → Fine‑grained → revoke. It was exposed
  in plain text and must be considered compromised.
- Consider rotating the keys that were pasted in chat earlier in the project
  (OpenRouter, Resend, Supabase service‑role) if not already done.

## 6. Next engineering priority (recommended)
Implement the **esbuild‑wasm preview engine** per `docs/preview-compiler-esbuild-plan.md`.
It ends the recurring "preview won't compile" bug class (~1,200 lines of regex
transpiling → a real bundler), and gives precise error diagnostics that make the
agent's self‑fix loop converge instead of loop. ~1.5 days to a flagged engine.

## 7. Known infra gotchas (observed this session)
- **Coolify UI** intermittently renders a blank/black screen (Livewire hydration),
  especially while a build saturates the 2‑vCPU VPS. Hard‑refresh, or check the
  **Deployments** tab from a fresh browser session.
- **VPS is 2 vCPU / 8 GB** — Next.js builds peg it; a 4 GB swapfile is configured.
  Builds can take several minutes; the previous container keeps serving (rolling).
- **Sandbox/mount caveat:** session‑edited files can read truncated via the Linux
  sandbox mount — verify file contents with the editor's own Read, not `cat` from the
  sandbox, and never `git commit` from the sandbox.
