-- Migration 185: let preview-pinned annotations live in project_comments.
--
-- src/components/editor/preview-annotations.tsx (click-anywhere-on-the-preview
-- pins) previously stored its data in project_chat_state.preview_annotations,
-- a JSON blob private to that one component. That meant a pin dropped on the
-- preview never showed up in the Comments panel (comments-panel.tsx) or the
-- guest embed (src/routes/api/embed/comments.ts) — both of which already
-- read/write the relational project_comments table. This migration adds
-- what's needed for pins to live in that same table instead: a percent-based
-- canvas position, a color, and a client-chosen id so the client can
-- upsert/delete its own pins idempotently without a round-trip just to learn
-- the server-assigned id first.
--
-- A regular (non-pin) comment leaves pin_x/pin_y/pin_color/client_id NULL.

ALTER TABLE public.project_comments
  ADD COLUMN IF NOT EXISTS pin_x REAL,
  ADD COLUMN IF NOT EXISTS pin_y REAL,
  ADD COLUMN IF NOT EXISTS pin_color TEXT,
  ADD COLUMN IF NOT EXISTS client_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS project_comments_project_client_id_idx
  ON public.project_comments (project_id, client_id)
  WHERE client_id IS NOT NULL;

COMMENT ON COLUMN public.project_comments.pin_x IS
  'Percent of preview width where this comment is pinned (NULL for a non-pin/thread comment).';
COMMENT ON COLUMN public.project_comments.pin_y IS
  'Percent of preview height where this comment is pinned (NULL for a non-pin/thread comment).';
COMMENT ON COLUMN public.project_comments.pin_color IS
  'UI color tag for a preview pin (e.g. "yellow", "blue") — cosmetic only.';
COMMENT ON COLUMN public.project_comments.client_id IS
  'Client-generated id for a preview pin, unique per project, so the client can upsert/delete its own pin without knowing the server row id first.';
