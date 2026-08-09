export const SUPABASE_BACKEND_PROMPT = `Connected backend: Supabase
- Use the existing shared Supabase client; do not create competing clients.
- Put schema changes in numbered SQL migration files.
- Enable RLS and add least-privilege policies for every user-owned table.
- Never expose service-role or management credentials in generated client files.
- Include deterministic local fallback data only when the app must preview before provisioning completes.`;
