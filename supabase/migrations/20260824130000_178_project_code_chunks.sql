-- Migration 178: incremental per-project code index (Cursor-style).
--
-- Chunks are declaration-aligned (see src/lib/editor/code-chunker.ts) and
-- re-embedded ONLY when a file's hash changes — file_hash is the Merkle-leaf
-- equivalent that makes sync incremental. Embeddings are stored as JSONB
-- float arrays with the producing model recorded per row, exactly like
-- message_embeddings (093): rows whose model no longer matches the active
-- embedding source are treated as stale and re-embedded, never compared
-- cross-model (cosineSimilarity dimension-guards as the final backstop).

CREATE TABLE IF NOT EXISTS public.project_code_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  chunk_index INT NOT NULL,
  start_line INT NOT NULL,
  end_line INT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'decl',
  name TEXT NOT NULL DEFAULT '',
  file_hash TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  embedding JSONB NOT NULL,
  content_excerpt TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, path, chunk_index)
);

CREATE INDEX IF NOT EXISTS project_code_chunks_project_id_idx
  ON public.project_code_chunks (project_id);

CREATE INDEX IF NOT EXISTS project_code_chunks_project_path_idx
  ON public.project_code_chunks (project_id, path);

DROP TRIGGER IF EXISTS update_project_code_chunks_updated_at ON public.project_code_chunks;
CREATE TRIGGER update_project_code_chunks_updated_at
  BEFORE UPDATE ON public.project_code_chunks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.project_code_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_code_chunks_select" ON public.project_code_chunks;
CREATE POLICY "project_code_chunks_select" ON public.project_code_chunks
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Writes happen via service role / server routes; allow authenticated
-- writes for owners/editors so future client paths stay consistent
-- (same posture as message_embeddings).
DROP POLICY IF EXISTS "project_code_chunks_write" ON public.project_code_chunks;
CREATE POLICY "project_code_chunks_write" ON public.project_code_chunks
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_code_chunks TO authenticated;
