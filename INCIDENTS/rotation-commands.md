Rotation & GitHub update commands

Do NOT paste secrets into the repo. Use these commands in a local terminal or CI, replacing `<new-key>` with the secret value you generate in the provider dashboard.

OpenRouter
1. Revoke the exposed key at: https://openrouter.ai/account/keys
2. Create a new key.
3. Update GitHub Actions secret (requires `gh` CLI and repo admin):

```powershell
# replace owner/repo with your repo
gh secret set OPENROUTER_API_KEY -b"<new-key>" --repo maqsoodjamvi1/lifemarkai
```

Resend
1. Revoke the exposed key at: https://resend.com/dashboard/keys
2. Create a new key.
3. Update GitHub Actions secret:

```powershell
gh secret set RESEND_API_KEY -b"<new-key>" --repo maqsoodjamvi1/lifemarkai
```

Supabase (Service Role / PAT)
1. In Supabase: Project → Settings → API, revoke the Service Role / PAT.
2. Create a new Service Role key or PAT as appropriate.
3. Update GitHub Actions secret and any server-side envs:

```powershell
gh secret set SUPABASE_SERVICE_ROLE_KEY -b"<new-key>" --repo maqsoodjamvi1/lifemarkai
```

CI / Deployment updates
- After updating GitHub secrets, trigger a redeploy of servers and CI that use them.
- If you use other secret stores (Vault, Azure KeyVault, Netlify, Vercel), update the secret there too.

Local dev guidance
- Do NOT commit `.env.local` or any env containing secrets. Keep env-only values locally and in the secret store.
- Use `.env.local` only for local development and ensure it is included in `.gitignore`.

Verification
- After rotation and updating secrets, run `gitleaks detect --source . --report-path gitleaks-after-rotation.json --redact` and confirm no high-priority leaks remain.

If you want I can prepare exact `gh` CLI commands for additional secrets or run `gh secret` updates (requires repo admin access).