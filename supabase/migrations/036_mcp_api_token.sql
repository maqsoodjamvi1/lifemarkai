-- Add mcp_api_token to profiles for authenticating MCP server requests
-- pgcrypto (gen_random_bytes) lives in the `extensions` schema — see 035.
SET search_path = public, extensions;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mcp_api_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex');
CREATE INDEX IF NOT EXISTS idx_profiles_mcp_api_token ON profiles(mcp_api_token);
