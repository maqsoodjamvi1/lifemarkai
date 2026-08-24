"""
LifemarkAI Intelligence Service.

A specialist Python microservice called by the main TypeScript app for tasks
where the Python ecosystem is meaningfully better: local embeddings (no
external API key) and real AST parsing (vs. the regex heuristics currently
in src/lib/ai/code-analyzer.ts). This does NOT replace the TypeScript
orchestrator, streaming chat loop, credit system, or self-healing scan
engine — those stay in TypeScript. See services/intelligence/README.md.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from routers import analyze, embed

app = FastAPI(title="LifemarkAI Intelligence Service", version="0.1.0")

app.include_router(embed.router, prefix="/embed", tags=["embed"])
app.include_router(analyze.router, prefix="/analyze", tags=["analyze"])


@app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})
