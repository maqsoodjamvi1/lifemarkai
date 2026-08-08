Incident notification — Secret exposure in `codex/security-hardening`

Short summary
- On 2026-08-08 a local commit (`83f66adc`) accidentally included `.tmp-docker-run.env` containing API keys (OpenRouter, Resend, Supabase). I removed the file from history, force-pushed a cleaned `codex/security-hardening`, and added `.tmp-docker-run.env` to `.gitignore`.

Actions taken
- Created backup branch: `backup/remove-secrets-83f66ad`.
- Rewrote git history to remove `.tmp-docker-run.env` (filter-branch used), ran GC, and force-pushed cleaned `codex/security-hardening`.
- Added `.tmp-docker-run.env` to `.gitignore` and pushed the update.
- Performed a deeper repo scan (gitleaks) and found additional sensitive values in `./.env.local` and several `.next` dev artifacts.

Immediate required actions (owner/admin required)
1. Revoke and rotate these credentials immediately (do not reuse):
   - OpenRouter API key
   - Resend API key
   - Supabase Service Role / PAT
2. Remove or scrub any dev artifacts that contain secrets (`.next/dev/*`) from the repo and ensure they are ignored.
3. Update CI / GitHub Secrets with new values after rotation.
4. Audit provider dashboards for suspicious activity.

Helpful links
- GitHub push-protection guidance: https://docs.github.com/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line#resolving-a-blocked-push
- OpenRouter keys: https://openrouter.ai/account/keys
- Resend keys: https://resend.com/dashboard/keys
- Supabase API docs / dashboard: https://app.supabase.com/ (Project → Settings → API)

Suggested next steps I can help with
- Provide per-provider rotation commands and `gh` CLI steps to update GitHub secrets.
- Draft a Slack/PR message to notify the team and CI owners (I can post the draft here for you to copy).
- Run another `gitleaks` scan after you rotate keys to confirm no secrets remain.

Contact
- I prepared incident notes in the `INCIDENTS/` folder. Tell me which rotation you want to execute first and I will prepare precise steps.
