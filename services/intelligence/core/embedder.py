"""
Local embedding model wrapper.

Default model: jinaai/jina-embeddings-v2-base-code — a CODE-trained
embedding model (768-dim, ~160M params, 8192-token context) that
substantially outperforms generic text models like all-MiniLM-L6-v2 on
code retrieval. Runs fine on CPU; no API key, no per-call cost.

Override with EMBED_MODEL (and optionally EMBED_MODEL_REVISION to pin the
exact HF revision — recommended in production because the jina code model
loads custom modeling code via trust_remote_code).

Dimensionality note: this model outputs 768-dim vectors; OpenAI's
text-embedding-3-small outputs 1536-dim; the old MiniLM default output
384-dim. LifemarkAI stores embeddings as JSONB with a `model` column and
re-embeds rows whose model doesn't match the active one (see
message-embeddings.ts / code-index.ts), so switching models is safe:
mixed-model rows are treated as stale, never compared cross-dimension
(cosineSimilarity returns null on dimension mismatch as the final guard).
"""

from __future__ import annotations

import os
import threading
from functools import lru_cache

from sentence_transformers import SentenceTransformer

_MODEL_NAME = os.environ.get("EMBED_MODEL", "jinaai/jina-embeddings-v2-base-code")
_MODEL_REVISION = os.environ.get("EMBED_MODEL_REVISION") or None
# The jina v2 code model ships custom modeling code (ALiBi attention);
# loading it requires trust_remote_code. Allow opting out for stock models.
_TRUST_REMOTE_CODE = os.environ.get("EMBED_TRUST_REMOTE_CODE", "1") not in ("0", "false", "no")
# Code chunks benefit from more context than chat excerpts; jina handles
# 8192 tokens, so a 6000-char cap (~1500 tokens) is comfortably safe.
_MAX_CHARS = int(os.environ.get("EMBED_MAX_CHARS", "6000"))
_lock = threading.Lock()


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    # Loaded once per process, lazily, so the service boots fast and only
    # pays the model-load cost on first request.
    return SentenceTransformer(
        _MODEL_NAME,
        revision=_MODEL_REVISION,
        trust_remote_code=_TRUST_REMOTE_CODE,
    )


def model_name() -> str:
    return _MODEL_NAME


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts, each truncated to EMBED_MAX_CHARS chars."""
    clean = [t.strip()[:_MAX_CHARS] for t in texts if t and t.strip()]
    if not clean:
        return []
    with _lock:
        model = _get_model()
        vectors = model.encode(clean, convert_to_numpy=True, show_progress_bar=False)
    return vectors.tolist()


def embedding_dim() -> int:
    with _lock:
        return _get_model().get_sentence_embedding_dimension()
