-- Migration 093: persist chat message embeddings for semantic search.
-- Avoids re-embedding up to 300 messages on every search query.

CREATE TABLE IF NOT EXISTS public.message_embeddings (
  message_id UUID PRIMARY KEY REFERENCES public.messages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  embedding JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS message_embeddings_project_id_idx
  ON public.message_embeddings (project_id);

DROP TRIGGER IF EXISTS update_message_embeddings_updated_at ON public.message_embeddings;
CREATE TRIGGER update_message_embeddings_updated_at
  BEFORE UPDATE ON public.message_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_embeddings_select" ON public.message_embeddings;
CREATE POLICY "message_embeddings_select" ON public.message_embeddings
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Writes happen via service role / server routes; allow authenticated upserts
-- for owners/editors so future client paths stay consistent.
DROP POLICY IF EXISTS "message_embeddings_upsert" ON public.message_embeddings;
CREATE POLICY "message_embeddings_upsert" ON public.message_embeddings
  FOR ALL USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid()
        AND accepted_at IS NOT NULL
        AND role IN ('owner', 'editor')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_embeddings TO authenticated;
