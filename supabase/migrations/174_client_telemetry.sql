-- 174_client_telemetry.sql
-- Phase 2 of the Vercel adoption plan: sink for web vitals, app timings and
-- product/funnel events posted by src/lib/analytics/client-telemetry.ts via
-- /api/telemetry/client.
--
-- Privacy by schema: there are no columns that COULD hold a prompt, a
-- filename, or a raw identifier. user_hash/project_hash are 8-hex FNV hashes
-- computed in the browser; the server re-validates their shape before insert.

CREATE TABLE IF NOT EXISTS public.client_telemetry (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind           TEXT NOT NULL CHECK (kind IN ('vital', 'timing', 'event')),
  name           TEXT NOT NULL,
  surface        TEXT NOT NULL CHECK (surface IN
    ('marketing','dashboard','editor','preview','billing','onboarding','auth','other')),
  value          DOUBLE PRECISION,
  props          JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_hash      TEXT CHECK (user_hash    ~ '^[a-f0-9]{8}$'),
  project_hash   TEXT CHECK (project_hash ~ '^[a-f0-9]{8}$'),
  session_sample DOUBLE PRECISION NOT NULL DEFAULT 1
);

-- The two queries that matter: vitals percentile by surface over time, and
-- funnel counts by event name over time.
CREATE INDEX IF NOT EXISTS client_telemetry_surface_idx
  ON public.client_telemetry (surface, kind, name, created_at DESC);
CREATE INDEX IF NOT EXISTS client_telemetry_created_idx
  ON public.client_telemetry (created_at DESC);

ALTER TABLE public.client_telemetry ENABLE ROW LEVEL SECURITY;
-- Service-role writes only (the API route); no user-facing reads yet.

COMMENT ON TABLE public.client_telemetry IS
  'Phase 2 client telemetry: Core Web Vitals, app timings, product funnel events. Hashed identifiers only.';
