import { DatabaseManagerPanel } from "./database-manager-panel";

interface DbQueryPanelProps {
  projectId: string;
  isLocked?: boolean;
}

/**
 * SQL console for the APP's managed backend (Lifemark Cloud / connected
 * Supabase) — never the platform database. The old playground called
 * exec_sql on the shared Lifemark Postgres; this panel is the Database
 * Manager SQL tab, which only runs against the project's own backend.
 */
export function DbQueryPanel({ projectId, isLocked }: DbQueryPanelProps) {
  return <DatabaseManagerPanel projectId={projectId} isLocked={isLocked} initialTab="sql" />;
}
