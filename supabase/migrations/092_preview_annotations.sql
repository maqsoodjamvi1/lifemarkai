-- Migration 092: persist preview draw annotations on project_chat_state.

ALTER TABLE public.project_chat_state
  ADD COLUMN IF NOT EXISTS preview_annotations JSONB NOT NULL DEFAULT '[]'::jsonb;
