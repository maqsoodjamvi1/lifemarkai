-- Migration 067: Fix RPC conflicts after 063 + get_user_stats type mismatch
--
-- 063 introduced NUMERIC overloads but left the 003 INTEGER overloads (especially
-- deduct_credits with an extra description arg), causing ambiguous RPC resolution.
-- credit_logs.amount is NUMERIC after 063, so get_user_stats must cast SUM() to BIGINT.

-- Drop legacy INTEGER overloads superseded by migration 063
DROP FUNCTION IF EXISTS deduct_credits(UUID, INTEGER, TEXT, UUID);
DROP FUNCTION IF EXISTS deduct_credits(UUID, INTEGER, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS add_credits(UUID, INTEGER, TEXT, TEXT);

-- Fix get_user_stats: SUM(ABS(amount)) returns NUMERIC when amount is NUMERIC
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE (
  total_projects BIGINT,
  live_projects BIGINT,
  total_messages BIGINT,
  total_deployments BIGINT,
  credits_used BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM projects WHERE user_id = p_user_id) AS total_projects,
    (SELECT COUNT(*) FROM projects WHERE user_id = p_user_id AND deployed_url IS NOT NULL) AS live_projects,
    (SELECT COUNT(*) FROM messages m JOIN projects p ON m.project_id = p.id WHERE p.user_id = p_user_id) AS total_messages,
    (SELECT COUNT(*) FROM deployments WHERE user_id = p_user_id) AS total_deployments,
    (SELECT COALESCE(SUM(ABS(amount))::BIGINT, 0) FROM credit_logs WHERE user_id = p_user_id AND amount < 0) AS credits_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
