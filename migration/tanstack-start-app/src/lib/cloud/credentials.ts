/**
 * Server-only credential storage for dedicated managed backends.
 *
 * ── Why this module exists ──────────────────────────────────────────────────
 *
 * `createManagedProject()` generates a 28-character Postgres password, sends it
 * to Supabase to create the project, and returns it. Both of its call sites
 * destructured only `{ ref }` and dropped the password on the floor.
 *
 * Supabase does not let you read a project's database password back. It is
 * shown once, at creation, and after that the only recovery is a reset. So every
 * project provisioned that way would have been permanently unable to accept a
 * direct Postgres connection — no psql, no connection-string migrations, no
 * pooler, no external BI tool, no pg_dump. The REST API would keep working,
 * which is exactly what makes the failure quiet: everything looks fine until
 * someone needs the one thing that's gone.
 *
 * The column was always there (migration 086 moved `db_password` into
 * `project_cloud_credentials`, service-role only, no authenticated policies).
 * Nothing ever wrote to it.
 *
 * This is a helper rather than a line inside each caller because the mistake
 * has already been made at 100% of call sites, and `credentials.test.ts` asserts
 * at the source level that every `createManagedProject` call is followed by a
 * call to `persistManagedDbPassword`. Types cannot express "you must not ignore
 * this return value"; that test can.
 */
export interface PersistCredentialsResult {
  ok: boolean;
  error?: string;
}

/**
 * Store the one-time Postgres password for a freshly created managed project.
 *
 * Uses the service-role client deliberately: `project_cloud_credentials` revokes
 * all access from anon and authenticated, so a request-scoped client silently
 * writes nothing. Upserts so a re-provision overwrites cleanly.
 *
 * Never throws. A provisioned backend with an unsaved password is bad; a build
 * that fails because we could not save it is worse, and the caller is always
 * mid-provision when this runs. Callers should surface `ok: false` to the user
 * rather than swallow it — losing this silently is the whole bug.
 */
export async function persistManagedDbPassword(
  projectId: string,
  dbPassword: string,
): Promise<PersistCredentialsResult> {
  if (!projectId) return { ok: false, error: "projectId is required" };
  // An empty password means Supabase did not echo `db_pass` back. Writing ""
  // would be worse than writing nothing: it looks like a stored credential.
  if (!dbPassword) return { ok: false, error: "no password returned by the Management API" };

  try {
    // Imported lazily on purpose. The Supabase server module reads
    // `import.meta.env` at load time, which throws outside Vite — so a static
    // import here would make this module unimportable by the test runner, and
    // the source-level guard in credentials.test.ts is the only thing standing
    // between us and dropping the password again.
    const { createAdminClient } = await import("../supabase/server.ts");
    const admin = createAdminClient();
    const { error } = await (admin as unknown as {
      from: (t: string) => {
        upsert: (v: Record<string, unknown>, o: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
      };
    })
      .from("project_cloud_credentials")
      .upsert(
        {
          project_id: projectId,
          db_password: dbPassword,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}
