-- Migration 009: Incremental snapshot storage (file-level deltas)
--
-- Instead of storing full file arrays per snapshot, we now store:
--   • Baseline snapshots  — full files JSONB (is_baseline = true, parent_id = null)
--   • Delta snapshots     — only changed files (is_baseline = false, parent_id → previous)
--
-- A delta stores an array of patch operations:
--   { "op": "add"|"replace", "path": "src/App.tsx", "content": "...", "language": "tsx" }
--   { "op": "remove",        "path": "src/old.ts" }
--
-- Reconstruction: walk the chain from root baseline, apply each delta in order.
-- Average savings: ~80–95% for iterative AI edits that touch 1–3 files per turn.

-- ── Schema changes ────────────────────────────────────────────────────────────

ALTER TABLE project_snapshots
  ADD COLUMN IF NOT EXISTS parent_id   UUID REFERENCES project_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS patches     JSONB;   -- null for baselines, populated for deltas

-- Backfill: all existing rows are baselines
UPDATE project_snapshots SET is_baseline = TRUE WHERE is_baseline IS NULL;

-- Index for chain traversal (parent → children)
CREATE INDEX IF NOT EXISTS snapshots_parent_id ON project_snapshots (parent_id)
  WHERE parent_id IS NOT NULL;

-- Index: latest snapshot per project (for diffing against)
CREATE INDEX IF NOT EXISTS snapshots_project_latest
  ON project_snapshots (project_id, created_at DESC);

-- ── Reconstruction RPC ────────────────────────────────────────────────────────
-- Returns the full reconstructed file list for a given snapshot by walking
-- the parent chain from the root baseline.
--
-- Called from the API layer (avoids N+1 queries by doing the chain walk in SQL).

CREATE OR REPLACE FUNCTION get_snapshot_chain(p_snapshot_id UUID)
RETURNS TABLE (
  id          UUID,
  is_baseline BOOLEAN,
  files       JSONB,
  patches     JSONB,
  created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids   UUID[];
  v_cur   UUID := p_snapshot_id;
BEGIN
  -- Walk up the parent chain collecting IDs (max depth 500 to prevent infinite loops)
  WHILE v_cur IS NOT NULL AND array_length(v_ids, 1) < 500 LOOP
    v_ids := array_append(v_ids, v_cur);
    SELECT parent_id INTO v_cur
      FROM project_snapshots
     WHERE id = v_ids[array_length(v_ids, 1)];
  END LOOP;

  -- Return chain oldest-first so the caller can apply deltas in order
  RETURN QUERY
    SELECT s.id, s.is_baseline, s.files, s.patches, s.created_at
      FROM project_snapshots s
     WHERE s.id = ANY(v_ids)
     ORDER BY s.created_at ASC;
END;
$$;

-- ── Prune helper ──────────────────────────────────────────────────────────────
-- Force a new baseline every N deltas to bound chain length.
-- Called automatically from the API when delta count hits the threshold.

CREATE OR REPLACE FUNCTION count_delta_chain(p_snapshot_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_id, is_baseline
      FROM project_snapshots
     WHERE id = p_snapshot_id
    UNION ALL
    SELECT s.id, s.parent_id, s.is_baseline
      FROM project_snapshots s
      JOIN chain c ON c.parent_id = s.id
     WHERE NOT s.is_baseline
  )
  SELECT COUNT(*)::INTEGER FROM chain WHERE NOT is_baseline;
$$;
