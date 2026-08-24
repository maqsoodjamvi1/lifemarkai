# LifemarkAI Intelligence Service

A specialist Python microservice for the two things Python's ecosystem does
meaningfully better than the current TypeScript stack:

- **Local embeddings** (`POST /embed`) — `sentence-transformers/all-MiniLM-L6-v2`,
  runs on CPU, no external API key. This directly fixes a real gap: today,
  `src/lib/ai/embed-text.ts` silently returns `null` (degrading semantic search
  to keyword search) whenever `OPENAI_API_KEY` is unset — which, per the file's
  own audit comment (2026-08-19), is the normal state of this deployment.

- **Real AST analysis** (`POST /analyze/file`, `/analyze/project`,
  `/analyze/find-definition`) — tree-sitter based parsing for TS/TSX/JS/JSX.
  `src/lib/ai/code-analyzer.ts` uses line/brace regex heuristics by design
  (to avoid bundling the TypeScript compiler at runtime) and says so in its
  own header comment, naming tree-sitter as the upgrade path. This service
  is that upgrade path, as an optional out-of-process call instead of an
  in-bundle dependency.

Both endpoints are additive: existing TypeScript code paths still work
standalone. This service is only called when `INTELLIGENCE_SERVICE_URL` is
set, and every client call in `intelligence-client.ts` fails soft (returns
`null`) on any error — nothing breaks if the service is down or not deployed.

## Verification status (2026-08-24)

Ran the actual FastAPI service (not just unit-level Python calls) via
`uvicorn main:app` and hit it over real HTTP:

- `POST /embed` — returned real 384-dim vectors for two test strings.
  ~5.5s cold (one-time model download+load), fast after.
- `POST /analyze/file` — ran against the real `self-healing.ts` (574 lines)
  from this project: correctly extracted all 21 top-level symbols (types,
  interfaces, consts, functions) with correct exported flags, in 34ms.
- `POST /analyze/find-definition` — correctly located `analyzeFile` in
  `code-analyzer.ts` only, across a 3-file search that included two files
  where the symbol is referenced but not defined.

Not yet verified: the Docker image build itself. The build environment used
to develop this couldn't reach either `download.pytorch.org` or `pypi.org`
from inside a `docker build` (SSL cert failures against a self-signed CA —
a sandbox-networking artifact, not a problem with the Dockerfile: plain
`pip install` worked fine directly on that same host, outside Docker).
Build it on your actual deploy host before trusting the image; the
application code itself is verified working.

## Running locally

```bash
cd services/intelligence
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

First request will download the embedding model (~80MB) from Hugging Face
if it wasn't baked into a Docker image.

## Running via Docker

```bash
docker build -t lifemarkai-intelligence services/intelligence
docker run -p 8001:8001 lifemarkai-intelligence
```

## Wiring into the main app

Add to your env (`.env.local` and Coolify's env config for the main app):

```
INTELLIGENCE_SERVICE_URL=http://intelligence:8001
```

(`http://localhost:8001` for local dev without Docker Compose networking.)

Add the service to whatever Compose file / Coolify resource orchestrates
your other containers — see `docker-compose.intelligence.example.yml` at the
project root for a starting point. In Coolify specifically: add this as a
second service within the same project so it shares the internal network,
or as its own Docker resource and point `INTELLIGENCE_SERVICE_URL` at its
internal hostname.

## Dimensionality note (read before wiring embeddings into a DB column)

OpenAI's `text-embedding-3-small` outputs 1536-dim vectors.
`all-MiniLM-L6-v2` outputs 384-dim vectors. If you already have a pgvector
column sized for 1536 dims, do not point both sources at the same column —
check `supabase/migrations` for `vector(1536)` first. Either add a dedicated
384-dim column, or run a full re-embed pass if you're switching sources
entirely. `embed-text.ts` picks one source per deployment based on which env
var is set (OpenAI key present → OpenAI; else local service if configured);
it does not mix the two for a single stored vector.

## What this deliberately does NOT include

No self-healing/security-scanning endpoint yet, no ranking model, no
LangGraph/CrewAI agent runner. Those were sketched conceptually in the
earlier conversation but aren't built — they'd duplicate real, working logic
that already exists in `src/lib/ai/self-healing.ts` (static health scan,
persisted to `health_findings`) and the TypeScript Editor Intelligence
orchestrator. If/when you want deeper security scanning (e.g. semgrep) or
AST-driven self-healing suggestions, add them as new routers here rather
than reimplementing what `self-healing.ts` already does — call this
service's `/analyze/*` endpoints *from* the existing scan for richer input,
don't replace the scan orchestration itself.
