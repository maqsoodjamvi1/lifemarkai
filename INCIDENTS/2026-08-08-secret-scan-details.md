Secret scan details — 2026-08-08

Scope
- Performed an exhaustive repo scan for private keys, API tokens, and high-entropy blobs.
- Patterns include: private-key PEM headers, long base64-like strings, common provider tokens (sk-*, AKIA*, SUPABASE keys), and named providers (OPENROUTER, RESEND, OPENAI).

High-priority findings (do not share these values publicly)
- `./.env.local` — contains live credentials: OpenRouter API key, Supabase service role key / PAT, Resend API key. Treat these as compromised and rotate immediately.
- `./.next/dev/prerender-manifest.json` — contains preview/signing keys used by Next dev; treat as ephemeral dev secret and rotate if used in production flows.
- `./.next/dev/logs/next-development.log` and other `.next/dev/*` files — dev artifacts contain runtime warnings and may include tokens or URLs; remove or rotate any secrets referenced there.

Other notable matches (examples)
- `./.env.local.example` — contains placeholders and recommended keys (expected; safe if placeholders only).
- Various `.next/*` manifests and build artifacts contain long hashes or runtime keys (likely dev-only but reviewed).
- Several generated/transcript files and temporary diagnostic files appeared in scan matches; these are not intended for source control.

Immediate recommended actions (order matters)
1. Rotate/Revoke exposed credentials now (manual step):
   - OpenRouter API key: revoke via https://openrouter.ai/account/keys and create a new key. Update your deployments/CI to use the new key.
   - Resend API key: revoke and recreate at https://resend.com/dashboard/keys and update any services using it.
   - Supabase Service Role / PAT: revoke the old one in the Supabase project dashboard (Project → Settings → API → Service Role) and create a new one. Update any server-side code/CI to use the new key.
2. Wipe dev artifacts and logs from the repo (if not already):
   - Remove `.next/dev/logs` and other dev-only folders from the repository and ensure they are ignored by `.gitignore`.
   - Remove any remaining env files from the repo root (commit history should already be rewritten to drop `.tmp-docker-run.env`).
3. Re-run an exhaustive secret scan (you can use `git-secrets`, `truffleHog`, or `gitleaks`) on the current history and tags. Example quick command using `gitleaks` (install first):

```bash
# install gitleaks (mac/linux) or use binary for Windows
gitleaks detect --source . --report-path gitleaks-report.json
```

4. Audit logs where the leaked keys could have been used (OpenRouter, Resend, Supabase) for suspicious activity, and rotate any downstream credentials.
5. Inform team leads and rotate keys used in CI (GitHub Actions secrets or other secrets stores). If GitHub push-protection is blocking pushes, use the unblock URLs (admin) or rotate and reattempt push.

Per-service rotation quick steps
- OpenRouter
  - Dashboard: https://openrouter.ai/account/keys
  - Revoke the exposed key, create new key, update your `OPENROUTER_API_KEY` in CI/.env (server side only). Ensure the new key is not committed.
- Resend
  - Dashboard: https://resend.com/dashboard/keys
  - Revoke exposed key, create new one, update in server env/CI.
- Supabase (service role or PAT)
  - Project Dashboard → Settings → API
  - Revoke service role key / PAT and create new service role key. Update server-side envs and rotate any related database access credentials.

Commands to update local environment safely (example)

```powershell
# add new key to your local .env.local (do NOT commit)
# open .env.local with an editor, or use PowerShell to set or export env locally for dev
# Example: (Windows PowerShell)
notepad .env.local
# Paste new values locally; do not commit this file.

# Update GitHub Actions secret (example CLI)
# Requires gh CLI and repo admin permissions
gh secret set OPENROUTER_API_KEY -b"<new-key>" --repo maqsoodjamvi1/lifemarkai
gh secret set RESEND_API_KEY -b"<new-key>" --repo maqsoodjamvi1/lifemarkai
gh secret set SUPABASE_SERVICE_ROLE_KEY -b"<new-key>" --repo maqsoodjamvi1/lifemarkai
```

Audit & follow-up
- After rotation, monitor for anomalous usage in provider dashboards for at least 24–72 hours.
- If any rotated key was used by CI or deployed apps, ensure deployments are restarted with the new key.
- Optionally create an internal incident post (Slack/email) summarizing the exposure and actions taken. I can draft that message for you.

Report files created
- `INCIDENTS/2026-08-08-secret-removal.md` — summary of removal and recommended next steps.
- `INCIDENTS/2026-08-08-secret-scan-details.md` — this detailed scan report.

If you want
- I can run `gitleaks` or `gitleaks`-style tool now (requires installing the tool locally) and produce the JSON report.
- I can draft a short Slack/PR message for notifying admins and CI owners.
- I can prepare step-by-step commands tailored to one provider if you tell me which to rotate first.

Recorded: 2026-08-08
