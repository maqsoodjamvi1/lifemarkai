Slack/PR notification draft

Slack message (urgent)

Team — urgent: accidental commit exposed local env keys (OpenRouter, Resend, Supabase).
- What I did: removed `.tmp-docker-run.env` from history, force-pushed cleaned branch `codex/security-hardening`, and added the file to `.gitignore`.
- Immediate ask for owners: revoke and rotate these keys now and update GitHub Actions/CI secrets. Keys to rotate: OpenRouter API key, Resend API key, Supabase Service Role/PAT.
- Confirm in this channel when rotation is complete; I will re-run a secret scan and verify.

Short PR description (for review)

Fix: remove accidental env with secrets from history

This PR rewrites history to remove `.tmp-docker-run.env` which contained local env keys accidentally committed. Actions performed:
- Created backup branch `backup/remove-secrets-83f66ad`.
- Rewrote history to remove the file and force-pushed the cleaned `codex/security-hardening`.
- Added `.tmp-docker-run.env` to `.gitignore`.

Please note:
- The push-protection flagged exposed keys and blocked pushes earlier. The commit containing secrets has been removed from history, but **you must rotate the exposed keys** (OpenRouter, Resend, Supabase) immediately.
- After rotation, update GitHub secrets and any deployment configs referencing the old keys.

Suggested reviewers: repo admins, CI owners, and the team member who manages Supabase.

I can deploy the `gh secret set` commands and re-run `gitleaks` once you confirm rotation and provide new key values securely (do not paste keys into Slack or the repo).