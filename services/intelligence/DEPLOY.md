# Deploying the Intelligence Service (Coolify / VPS)

The service is optional and fails soft — the main app runs identically until
`INTELLIGENCE_SERVICE_URL` is set. Deploy it, verify it, THEN set the env var.

## 1. Push the code

`services/intelligence/` ships with the main repo. Push the bundle as usual —
no separate repository needed.

## 2. Create the service in Coolify

Add a new resource in the SAME Coolify project as the main app (so both share
the internal Docker network):

- Type: **Dockerfile** resource
- Repository: this repo, branch `master`
- Base directory / build context: `services/intelligence`
- Dockerfile: `services/intelligence/Dockerfile`
- Port: `8001` (internal only — do NOT expose it publicly; the service has
  no auth of its own and is meant to be reached only by the main app over
  the internal network)
- Health check: `GET /health` on 8001
- Memory limit: 2G recommended (torch + model resident in each worker)

The image build downloads CPU-only torch (~200MB) and bakes the embedding
model (~80MB) into the image, so first build takes a few minutes and the
image lands in the 1–2GB range. That is expected — see the Dockerfile
comments. This build has NOT yet been run end-to-end anywhere (the dev
sandbox couldn't reach package indexes from inside docker build); if it
fails on the torch install line, the Dockerfile comment explains the
plain-PyPI fallback.

## 3. Verify before wiring in

From the VPS (or a Coolify terminal on the main app's container):

```bash
curl http://<service-internal-host>:8001/health
# → {"status":"ok"}

curl -s -X POST http://<service-internal-host>:8001/embed \
  -H "Content-Type: application/json" \
  -d '{"texts":["hello world"]}' | head -c 200
# → {"embeddings":[[...384 floats...]],"dim":384,...}  (first call is slow: model load)
```

The internal hostname is whatever Coolify names the resource on the shared
network (check the resource's "Internal URL" / network alias).

## 4. Wire the main app to it

Add to the main app's environment in Coolify and redeploy:

```
INTELLIGENCE_SERVICE_URL=http://<service-internal-host>:8001
```

What turns on:
- Semantic chat search works without OPENAI_API_KEY (embed-text.ts falls
  back to this service; previously it silently degraded to keyword search).
- The agent's `analyze_code` / `find_definition` tools use real tree-sitter
  AST parsing (code-analyzer.ts `summarizeFileSmart`/`findDefinitionSmart`)
  instead of regex heuristics, falling back automatically if the service
  is unreachable.

## 5. Smoke-check after redeploy

In the editor, open chat search, switch to Semantic ("AI") mode, and search.
The result chip should read **cached** (violet), not **fallback** (amber).
First semantic search on a project re-embeds its recent messages — expect a
few seconds; subsequent searches are fast.

Note on stored embeddings: rows embedded earlier under OpenAI (1536-dim) are
automatically treated as stale by message-embeddings.ts (model column
mismatch) and re-embedded with the local model on first use. The dimension
guard in search-chat-messages.ts prevents any cross-model comparison in the
meantime.

## Rollback

Unset `INTELLIGENCE_SERVICE_URL` and redeploy the main app. Everything
returns to the prior behavior (keyword-search fallback, regex analyzer).
The service container can stay up or be deleted; nothing else references it.

## Embedding model (updated Aug 24 2026)

The default model is now **jinaai/jina-embeddings-v2-base-code** (768-dim,
code-trained — categorically better retrieval on code than the old MiniLM
text model). First request after deploy downloads ~320MB of weights, so the
first /embed call can take 1–3 minutes on the VPS; subsequent calls are
fast. Override with env:

- `EMBED_MODEL` — HF model id (default jinaai/jina-embeddings-v2-base-code)
- `EMBED_MODEL_REVISION` — pin an exact HF revision (recommended in prod;
  the jina code model loads custom modeling code via trust_remote_code)
- `EMBED_TRUST_REMOTE_CODE=0` — disable for stock sentence-transformers models
- `EMBED_MAX_CHARS` — per-text truncation (default 6000)

Existing stored embeddings (384-dim MiniLM rows) are handled automatically:
every row records its producing model, mismatched rows count as stale and
re-embed on next touch, and cosineSimilarity dimension-guards as backstop.
No manual backfill needed.
