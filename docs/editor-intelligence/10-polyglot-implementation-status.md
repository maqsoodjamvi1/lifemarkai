# Polyglot Editor Intelligence — COMPLETE

All Phase-1 polyglot items landed in one flow.

| Item | Status |
|------|--------|
| Impact risk → debate threshold | shipped |
| QA lens → self-verify.ts | shipped |
| Rust AST service | shipped |
| Python plan + embeddings | shipped |
| Re-index on file writes | shipped |
| Env in `.env.local.example` | shipped |
| Console health badge | shipped |
| Preview smoke-50 | shipped |

## Flow

```
goal → Python /plan (or LLM PM)
     → index + impactAnalysis raises task.risk
     → debate if risk >= 60
     → wave execute (agent.ts for write roles)
     → onVerify → runSelfVerification
     → done + verification payload
```

File saves → `scheduleReindexFile` → Rust `/index` (merge mode).
