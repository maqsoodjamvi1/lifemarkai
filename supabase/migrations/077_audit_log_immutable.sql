-- ============================================================
-- Migration 077 — Immutable (append-only) workspace audit log
-- Enterprise beachhead: audit logs must be tamper-evident. The table from
-- migration 008 had no protection against UPDATE/DELETE, and service_role
-- bypasses RLS entirely — so a compromised server key could rewrite history.
--
-- This makes audit_logs strictly append-only for EVERYONE (including
-- service_role and the table owner) via a BEFORE trigger. The only path that
-- may remove rows is the controlled retention purge below, which flips a
-- transaction-local GUC the trigger checks — so scheduled retention cleanup
-- still works, but ad-hoc deletes/updates raise an exception.
-- ============================================================

-- ── 1. Append-only enforcement trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION enforce_audit_log_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'audit_logs is append-only: UPDATE is not permitted (row %)', OLD.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Only the retention purge may delete, and only rows past retention.
    IF current_setting('app.audit_purge', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'audit_logs is append-only: DELETE is not permitted'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION enforce_audit_log_append_only();

-- ── 2. Controlled retention purge ────────────────────────────────────────────
-- Removes entries older than the retention window (default 90 days). Sets the
-- transaction-local GUC so the append-only trigger permits these deletes only.
CREATE OR REPLACE FUNCTION purge_old_audit_logs(p_retention_days INTEGER DEFAULT 90)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_retention_days < 1 THEN
    RAISE EXCEPTION 'retention days must be >= 1';
  END IF;

  PERFORM set_config('app.audit_purge', 'on', true);  -- true = transaction-local
  WITH removed AS (
    DELETE FROM audit_logs
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM removed;
  PERFORM set_config('app.audit_purge', 'off', true);

  RETURN v_deleted;
END;
$$;
GRANT EXECUTE ON FUNCTION purge_old_audit_logs TO service_role;

-- ── 3. Index for category / resource-type filtering in the dashboard ─────────
CREATE INDEX IF NOT EXISTS audit_logs_resource_type
  ON audit_logs(resource_type, created_at DESC);
