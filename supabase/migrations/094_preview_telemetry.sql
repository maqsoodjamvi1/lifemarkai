-- Migration 094: durable preview console/network telemetry for agent tools.
-- Survives serverless cold starts (unlike the in-memory ring buffer alone).

CREATE TABLE IF NOT EXISTS public.preview_telemetry (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  console_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  network_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_preview_telemetry_updated_at ON public.preview_telemetry;
CREATE TRIGGER update_preview_telemetry_updated_at
  BEFORE UPDATE ON public.preview_telemetry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.preview_telemetry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preview_telemetry_select" ON public.preview_telemetry;
CREATE POLICY "preview_telemetry_select" ON public.preview_telemetry
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "preview_telemetry_upsert" ON public.preview_telemetry;
CREATE POLICY "preview_telemetry_upsert" ON public.preview_telemetry
  FOR ALL USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'editor')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.preview_telemetry TO authenticated;
