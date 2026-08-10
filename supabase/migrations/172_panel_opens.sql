-- Panel-usage telemetry: one row per editor-panel open. Written only through
-- /api/telemetry/panel-open (service role). Query monthly to decide which of
-- the remaining panels earn their maintenance cost:
--   SELECT panel, count(*), count(DISTINCT user_id)
--   FROM panel_opens WHERE created_at > now() - interval '30 days'
--   GROUP BY panel ORDER BY 2 DESC;

CREATE TABLE IF NOT EXISTS public.panel_opens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  project_id uuid NULL,
  panel text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS panel_opens_panel_idx
  ON public.panel_opens (panel, created_at DESC);

GRANT ALL ON public.panel_opens TO service_role;

ALTER TABLE public.panel_opens ENABLE ROW LEVEL SECURITY;
