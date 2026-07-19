-- Migration 091: persisted chat UX state (pins, bookmarks, prompt queue).
-- Shared across browsers/devices for the same project (owner + collaborators).

CREATE TABLE IF NOT EXISTS public.project_chat_state (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  pinned_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  bookmarked_ids UUID[] NOT NULL DEFAULT '{}',
  prompt_queue JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_project_chat_state_updated_at ON public.project_chat_state;
CREATE TRIGGER update_project_chat_state_updated_at
  BEFORE UPDATE ON public.project_chat_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.project_chat_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_chat_state_select" ON public.project_chat_state;
CREATE POLICY "project_chat_state_select" ON public.project_chat_state
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "project_chat_state_insert" ON public.project_chat_state;
CREATE POLICY "project_chat_state_insert" ON public.project_chat_state
  FOR INSERT WITH CHECK (
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

DROP POLICY IF EXISTS "project_chat_state_update" ON public.project_chat_state;
CREATE POLICY "project_chat_state_update" ON public.project_chat_state
  FOR UPDATE USING (
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

DROP POLICY IF EXISTS "project_chat_state_delete" ON public.project_chat_state;
CREATE POLICY "project_chat_state_delete" ON public.project_chat_state
  FOR DELETE USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_state TO authenticated;
