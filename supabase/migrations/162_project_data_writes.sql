-- Migration 162: audit trail for agent-proposed writes to a project's live data
--
-- The agent may PROPOSE an INSERT/UPDATE/DELETE against a project's dedicated
-- managed Postgres. A human approves it, and only then does it run. This table
-- records the whole exchange, and it is required rather than best-effort: if we
-- cannot write the audit row we do not run the statement. An unlogged mutation
-- of a customer's production data is not a thing this product should be able to
-- produce.
--
-- What each row answers, months later, when someone asks "who changed this?":
--   what was proposed, against which project, by which model turn,
--   how many rows it said it would touch, who approved it, when,
--   and how it actually ended.

CREATE TABLE IF NOT EXISTS public.project_data_writes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- The statement exactly as it was shown to the approver, character for
  -- character. Never a normalised or re-rendered copy: the audit has to record
  -- what the human actually read.
  statement      TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('insert', 'update', 'delete')),
  target_table   TEXT NOT NULL,

  -- The count shown at approval time, and the count the database reported
  -- afterwards. They are stored separately on purpose — a gap between them is
  -- the signal that the data moved between preview and execution, which is
  -- exactly the case worth being able to find later.
  previewed_rows BIGINT,
  affected_rows  BIGINT,

  status         TEXT NOT NULL DEFAULT 'proposed'
                 CHECK (status IN ('proposed', 'approved', 'executed', 'failed', 'declined')),
  error          TEXT,

  proposed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  executed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS project_data_writes_project_idx
  ON public.project_data_writes (project_id, proposed_at DESC);

ALTER TABLE public.project_data_writes ENABLE ROW LEVEL SECURITY;

-- Project members may READ their own audit trail. That is the point of an audit
-- trail — the people whose data it is get to see what was done to it.
DROP POLICY IF EXISTS project_data_writes_select_own
  ON public.project_data_writes;

CREATE POLICY project_data_writes_select_own
  ON public.project_data_writes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
       WHERE p.id = project_data_writes.project_id
         AND p.user_id = auth.uid()
    )
  );

-- Deliberately no INSERT, UPDATE or DELETE policy for authenticated. Rows are
-- written only by the server-side service-role client. An audit trail its
-- subject can edit is not an audit trail.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.project_data_writes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.project_data_writes TO service_role;

COMMENT ON TABLE public.project_data_writes IS
  'Audit trail of agent-proposed, human-approved writes to a project''s live managed database. Append-only from the application''s perspective.';
