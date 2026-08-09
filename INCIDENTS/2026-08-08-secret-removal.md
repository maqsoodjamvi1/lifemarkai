Title: Secret exposure and removal — 2026-08-08

Summary
- Observer: Local cleanup after accidental commit included `.tmp-docker-run.env` containing secrets.
- Affected commit: `83f66adcbb85c7ae12b2d1806cd42447fe175911` (locally created; now removed from history).

Actions performed
- Created a backup branch: `backup/remove-secrets-83f66ad`.
- Rewrote git history to remove `.tmp-docker-run.env` (filter-branch used as git-filter-repo not available), ran GC, and force-pushed cleaned `codex/security-hardening`.
- Added `.tmp-docker-run.env` to `.gitignore` and committed the change.
- Ran a quick grep for common secret patterns across the repo; found exposures in `.env.local` and other example/config files (see findings below).

Findings (high-priority)
- `.env.local` contains real keys (OpenRouter, Supabase service role, Resend). These must be rotated immediately.
- `.env.local.example` contains placeholder values (document-only) — OK but check for any accidentally committed real keys.
- Logs and build artifacts under `.next/` contain runtime information; consider removing large dev logs from the repo if present.

Recommended next steps (manual)
1. Rotate immediately (revoke and reissue) the following credentials discovered:
   - OpenRouter API key
   - Resend API key
   - Supabase service role / personal access token
2. Confirm no other secrets are present in recent commits or tags: run a full secret-scan (recommended: `git filter-repo --invert-paths --path <file>` if additional files found, or use GitHub's push protection unblock flow for admin overrides).
3. Remove any development `.env.local` files from the repository and from any CI artifacts, and ensure `*.env*` is listed in `.gitignore` (already present).
4. If any exposed keys were used in public services, revoke and rotate, and audit recent logs for suspicious activity.
5. Notify project admins and rotate credentials used in CI or deploy targets.

Scan summary (quick)
- I scanned repo for common key patterns (OpenAI/OpenRouter/Resend/Supabase/API keys). Matches include `.env.local` lines with OpenRouter, Resend, and Supabase service keys; also entries in `.env.local.example` and some dev logs under `.next/`.

Notes
- I did not rotate any keys (requires access to provider dashboards).
- If you want, I can run a deeper secret scan, or assist in generating revocation/rotation commands for specific services.

Recorded by: automated cleanup script via dev agent
Date: 2026-08-08
