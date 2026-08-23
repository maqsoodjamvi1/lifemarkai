# LifemarkAI polyglot intelligence services

Node (TanStack orchestrator) + **Rust AST** + **Python AI** = denser planning
than Lovable-style pure chat.

| Service | Port | Role |
|---------|------|------|
| `rust-ast` | 8765 | Index, definition, callers, impact (risk feeds debates) |
| `python-ai` | 8766 | `/plan` (LLM or heuristic), semantic search + embeddings |

## Env (host app — also in `.env.local.example`)

```bash
LIFEMARK_RUST_AST_URL=http://127.0.0.1:8765
LIFEMARK_PYTHON_AI_URL=http://127.0.0.1:8766
LIFEMARK_POLYGLOT_TIMEOUT_MS=8000
```

Python service optional:

```bash
OPENAI_API_KEY=...          # enables embeddings + LLM plan
OPENAI_BASE_URL=...         # optional compatible endpoint
EMBEDDING_MODEL=text-embedding-3-small
PLAN_MODEL=gpt-4o-mini
```

## Run

```bash
# Python
cd services/python-ai && pip install -r requirements.txt && uvicorn main:app --port 8766

# Rust
cd services/rust-ast && cargo run --release
```

## Wire-in points

- `src/lib/intelligence/polyglot-bridge.ts` — client
- `src/lib/intelligence/reindex.ts` — fire-and-forget after file writes
- `src/lib/ai/editor-lenses/orchestrator.ts` — plan + AST risk + `onVerify` QA
- `src/routes/api/projects/$id/files.ts` — reindex on upsert/patch
- `src/routes/api/editor-intelligence/initiative.ts` — `onVerify` → `runSelfVerification`
- Console Team tab — `PolyglotStatus` badge
