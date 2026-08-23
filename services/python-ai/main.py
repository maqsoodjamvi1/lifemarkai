"""
LifemarkAI Python AI service - deep agent planning, RAG, semantic search.

Run:
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8766

Env:
  OPENAI_API_KEY  - enables embeddings + LLM plan
  OPENAI_BASE_URL - optional OpenAI-compatible endpoint
  EMBEDDING_MODEL - default text-embedding-3-small
  PLAN_MODEL      - default gpt-4o-mini
"""

from __future__ import annotations

import math
import os
import re
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="LifemarkAI Python AI", version="0.2.0")

_INDEX: dict[str, list[dict[str, Any]]] = {}  # project_id -> chunks with optional embedding


class SemanticSearchReq(BaseModel):
    query: str
    top_k: int = 8
    project_id: str | None = None


class PlanReq(BaseModel):
    goal: str
    context: dict[str, Any] = Field(default_factory=dict)


class IndexChunkReq(BaseModel):
    project_id: str
    chunks: list[dict[str, Any]]


def _openai_client():
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    try:
        from openai import OpenAI

        base = os.getenv("OPENAI_BASE_URL")
        return OpenAI(api_key=key, base_url=base) if base else OpenAI(api_key=key)
    except Exception:
        return None


def _embed(texts: list[str]) -> list[list[float]] | None:
    client = _openai_client()
    if not client or not texts:
        return None
    model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    try:
        res = client.embeddings.create(model=model, input=texts)
        return [d.embedding for d in res.data]
    except Exception:
        return None


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1e-9
    nb = math.sqrt(sum(x * x for x in b)) or 1e-9
    return dot / (na * nb)


@app.get("/health")
@app.post("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "python-ai",
        "embeddings": bool(os.getenv("OPENAI_API_KEY")),
        "version": "0.2.0",
    }


@app.post("/index-chunks")
def index_chunks(req: IndexChunkReq) -> dict[str, int]:
    chunks = list(req.chunks)
    texts = [(c.get("text") or c.get("snippet") or "")[:2000] for c in chunks]
    vectors = _embed(texts)
    if vectors:
        for c, v in zip(chunks, vectors):
            c["embedding"] = v
    _INDEX[req.project_id] = chunks
    return {"indexed": len(chunks)}


@app.post("/semantic-search")
def semantic_search(req: SemanticSearchReq) -> dict[str, Any]:
    pid = req.project_id or "default"
    chunks = _INDEX.get(pid) or []
    if not chunks:
        return {"hits": []}

    q_vecs = _embed([req.query])
    if q_vecs:
        qv = q_vecs[0]
        scored = []
        for c in chunks:
            emb = c.get("embedding")
            if not emb:
                continue
            scored.append(( _cosine(qv, emb), c))
        scored.sort(key=lambda x: -x[0])
        hits = []
        for score, c in scored[: req.top_k]:
            hits.append({
                "file": c.get("file") or c.get("path") or "",
                "startLine": int(c.get("start_line") or c.get("startLine") or 1),
                "endLine": int(c.get("end_line") or c.get("endLine") or 1),
                "snippet": (c.get("text") or c.get("snippet") or "")[:500],
                "score": float(score),
            })
        return {"hits": hits}

    # Fallback: keyword overlap
    q = req.query.lower()
    tokens = set(re.findall(r"[a-z0-9_]+", q))
    scored = []
    for c in chunks:
        text = (c.get("text") or c.get("snippet") or "").lower()
        tset = set(re.findall(r"[a-z0-9_]+", text))
        score = len(tokens & tset) / max(len(tokens), 1)
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    hits = []
    for score, c in scored[: req.top_k]:
        if score <= 0:
            continue
        hits.append({
            "file": c.get("file") or c.get("path") or "",
            "startLine": int(c.get("start_line") or c.get("startLine") or 1),
            "endLine": int(c.get("end_line") or c.get("endLine") or 1),
            "snippet": (c.get("text") or c.get("snippet") or "")[:500],
            "score": float(score),
        })
    return {"hits": hits}


def _guess_role(title: str) -> str:
    t = title.lower()
    if any(k in t for k in ("schema", "sql", "migration", "database", "postgres")):
        return "database"
    if any(k in t for k in ("deploy", "ci", "docker", "infra")):
        return "devops"
    if any(k in t for k in ("auth", "security", "rls", "xss")):
        return "security"
    if any(k in t for k in ("test", "qa", "verify")):
        return "qa"
    if any(k in t for k in ("ui", "page", "component", "css", "design")):
        return "frontend"
    if any(k in t for k in ("api", "route", "server", "endpoint")):
        return "backend"
    if any(k in t for k in ("arch", "system", "adr")):
        return "architect"
    return "frontend"


def _heuristic_plan(goal: str) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    steps.append({"id": "discover", "title": f"Discover requirements for: {goal[:80]}", "role": "ba", "risk": 10})
    steps.append({"id": "architecture", "title": "Propose architecture and data model", "role": "architect", "risk": 50})
    steps.append({"id": "ui-shell", "title": "Build UI shell and primary screens", "role": "frontend", "risk": 30})
    steps.append({"id": "api", "title": "Implement API routes and business logic", "role": "backend", "risk": 40})
    steps.append({"id": "data", "title": "Define schema and migrations", "role": "database", "risk": 45})
    steps.append({"id": "verify", "title": "QA self-verify and fix regressions", "role": "qa", "risk": 25})
    g = goal.lower()
    if any(k in g for k in ("auth", "login", "signup")):
        steps.insert(3, {"id": "auth", "title": "Auth + session flow", "role": "backend", "risk": 55})
    if any(k in g for k in ("payment", "stripe", "billing")):
        steps.append({"id": "payments", "title": "Stripe checkout + webhooks", "role": "backend", "risk": 60})
    return steps


def _llm_plan(goal: str, context: dict[str, Any]) -> list[dict[str, Any]] | None:
    client = _openai_client()
    if not client:
        return None
    model = os.getenv("PLAN_MODEL", "gpt-4o-mini")
    files = context.get("files") or []
    file_hint = ", ".join(str(f) for f in files[:40])
    constraints = context.get("constraints") or []
    system = (
        "You are a senior tech lead planning an app build. "
        "Return ONLY JSON: {\"steps\":[{\"id\":\"kebab\",\"title\":\"...\",\"role\":"
        "\"pm|ba|architect|designer|frontend|backend|database|devops|qa|security\","
        "\"risk\":0-100}]}. 5-12 ordered steps. Roles must match the enum."
    )
    user = f"Goal: {goal}\nFiles in workspace: {file_hint or 'none'}\nConstraints: {constraints}"
    try:
        res = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
            max_tokens=1200,
        )
        import json

        raw = res.choices[0].message.content or "{}"
        data = json.loads(raw)
        steps = data.get("steps") or []
        out = []
        for i, s in enumerate(steps):
            if not isinstance(s, dict) or not s.get("title"):
                continue
            out.append(
                {
                    "id": s.get("id") or f"step-{i + 1}",
                    "title": s["title"],
                    "role": s.get("role") or _guess_role(s["title"]),
                    "risk": int(s.get("risk") or 30),
                }
            )
        return out or None
    except Exception:
        return None


@app.post("/plan")
def plan(req: PlanReq) -> dict[str, Any]:
    llm_steps = _llm_plan(req.goal, req.context) if os.getenv("OPENAI_API_KEY") else None
    if llm_steps:
        steps = llm_steps
        planner = "llm-v1"
    else:
        steps = _heuristic_plan(req.goal)
        planner = "heuristic-v1"
    for s in steps:
        if "role" not in s:
            s["role"] = _guess_role(s["title"])
    return {"steps": steps, "planner": planner}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8766")))
