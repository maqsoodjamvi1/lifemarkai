-- Migration 058: fix get_user_stats live_projects count
--
-- The original (002) counted projects WHERE status = 'live', but 'live' is not
-- a legal projects.status value (CHECK allows 'active' | 'archived' |
-- 'building'), so live_projects was permanently 0. A project is "live" when it
-- has a deployed URL.

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
    (SELECT COALESCE(SUM(ABS(amount)), 0) FROM credit_logs WHERE user_id = p_user_id AND amount < 0) AS credits_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
