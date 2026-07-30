-- Allow Quick Edit / surgical "patch" turns to persist in messages.
-- Without this, inserts with mode='patch' fail the CHECK and chat history is lost.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_mode_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_mode_check
  CHECK (mode IN ('chat', 'agent', 'plan', 'build', 'patch'));
