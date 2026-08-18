# AI Gateway A/B — Phase 5 of the Vercel adoption plan

The Lifemark Cloudflare gateway (gateway/src/index.ts) remains the mandatory
application boundary — auth, attribution, cost calculation, credit deduction,
usage persistence, secret isolation and allowlists all stay in the Worker and
are upstream-agnostic. Phase 5 only adds a second UPSTREAM behind it:

```
App → Lifemark Gateway → OpenRouter            (default)
                       ↘ Vercel AI Gateway     (flagged)
```

## Worker env (set via wrangler secrets / vars)

| Var | Effect |
| --- | --- |
| `VERCEL_AI_GATEWAY_API_KEY` | unset → the upstream is disabled entirely |
| `VERCEL_AI_GATEWAY_ENABLED` | `false` = hard OFF (one-env rollback); `true` = all slash-model traffic |
| `VERCEL_AI_GATEWAY_PERCENT` | 0–100, deterministic per-user split (FNV on user id) — same user, same upstream, always |

Only slash models (the OpenRouter population) participate; native
`gpt-`/`claude-`/`gemini-` routing is untouched. Both upstreams are
OpenAI-compatible and serve the same model ids, so the A/B compares
gateways, never model families.

OpenRouter stays the **emergency upstream**: a 429/5xx from Vercel AI Gateway
retries once on OpenRouter with the same model. Usage is logged once, from
whichever response was actually returned — no double billing.

## Reading the results

Every gateway response now carries `X-Lifemark-Upstream: openrouter |
vercel-gateway`; gateway-client records it as an `external_call_completed`
event (`dependency: lifemark-gateway`). Join with `ai_eval_log` on
build_run_id for the comparison table:

| Metric | Source |
| --- | --- |
| Cost per million tokens | lifemark_cloud_usage rows during the window vs upstream share |
| Cost per successful build | above ÷ build success from record_generation_verification |
| Time to first token / total duration | ai_eval_log.latency_ms split by upstream events |
| Provider failure rate | ai_generation_failed events split by upstream |
| First-pass build success | verification events split by upstream |

## Decision gate (from the plan)

Switch fully only if cost per SUCCESSFUL build improves, or reliability is
materially better without quality loss. Keep OpenRouter configured as the
emergency upstream through the transition; remove OpenRouter-specific balance
checks (src/lib/ai/openrouter-credits.ts) only after full migration.
