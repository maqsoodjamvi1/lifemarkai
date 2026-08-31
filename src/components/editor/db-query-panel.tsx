import { Database, ShieldAlert } from "lucide-react";

interface DbQueryPanelProps {
  projectId: string;
}

/**
 * DbQueryPanel — DISABLED.
 *
 * This used to be a free-form SQL editor against /api/projects/:id/db-query,
 * which called a SECURITY DEFINER `exec_sql(text)` RPC with no scoping to
 * the calling project's own tables — any signed-in user could read every
 * other user's account (`auth.users`), every project's files, and every
 * chat message on the platform (the panel's own suggested example queries
 * demonstrated exactly that). The RPC's Postgres grant also let a user's
 * session JWT call it directly against Supabase's REST API, bypassing this
 * app entirely. See supabase/migrations/20260828020000_181_lockdown_exec_sql.sql
 * for the full writeup — that migration revokes the ability to call the
 * function at all, and the route now fails closed with a 503.
 *
 * The old SQL-editor UI (free-text SQL, an AI SQL generator, query history)
 * is removed rather than left in a broken-looking "half disabled" state —
 * re-enabling this feature needs a real per-project data scoping design,
 * not this component wired back up as-is.
 */
export function DbQueryPanel({ projectId: _projectId }: DbQueryPanelProps) {
  return (
    <div className="flex flex-col h-full text-sm">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-sky-400" />
          <h2 className="font-semibold text-foreground">DB Query Playground</h2>
        </div>
        <p className="text-xs text-muted-foreground">Temporarily disabled</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6 text-amber-400" />
        </div>
        <p className="text-sm font-medium text-foreground">This feature is temporarily disabled</p>
        <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
          The SQL playground allowed reading data across every project on the platform, not just this one — it's
          disabled while it gets rebuilt with real per-project scoping.
        </p>
      </div>
    </div>
  );
}
