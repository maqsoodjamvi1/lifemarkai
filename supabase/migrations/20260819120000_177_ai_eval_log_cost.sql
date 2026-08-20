-- ai_eval_log stored only a combined `tokens_used`, so a call could not be
-- priced after the fact: input and output differ by up to 6x (gpt-5.6-terra is
-- $2/M in, $12/M out). Every cost figure quoted about this product therefore
-- came from a synthetic benchmark rather than from its own traffic.
--
-- cost_usd is written at insert time by src/lib/ai/model-prices.ts. It is
-- NULLABLE on purpose: null means the model was absent from the price table,
-- which is an honest "unknown". A zero default would make an unpriced model
-- look free and silently under-report spend.
alter table public.ai_eval_log
  add column if not exists prompt_tokens integer,
  add column if not exists completion_tokens integer,
  add column if not exists cached_tokens integer,
  add column if not exists tool_errors integer,
  add column if not exists cost_usd numeric(12, 8);

comment on column public.ai_eval_log.prompt_tokens is 'Input tokens. Split from tokens_used so a call can be priced.';
comment on column public.ai_eval_log.completion_tokens is 'Output tokens. Priced separately — up to 6x the input rate.';
comment on column public.ai_eval_log.cached_tokens is 'Prompt tokens served from provider cache, when reported.';
comment on column public.ai_eval_log.tool_errors is 'Tool calls that errored, as distinct from tool_calls made.';
comment on column public.ai_eval_log.cost_usd is 'USD at time of call. NULL = model not in the price table (unknown, not free).';

-- Cost reporting is always "per model over a window", so index for that shape.
create index if not exists ai_eval_log_model_created_idx
  on public.ai_eval_log (model, created_at desc);
