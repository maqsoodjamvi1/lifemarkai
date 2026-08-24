"""
Local embedding model wrapper.

Uses sentence-transformers/all-MiniLM-L6-v2 by default: 384-dim, ~80MB,
fast enough on CPU for interactive use, no API key, no per-call cost.

IMPORTANT — dimensionality: this model outputs 384-dim vectors.
OpenAI's text-embedding-3-small (the model embed-text.ts calls) outputs
1536-dim vectors. If LifemarkAI stores embeddings in a fixed-width pgvector
column sized for 1536, switching the *source* of embeddings requires either:
  (a) a new pgvector column sized 384, with existing rows backfilled, or
  (b) padding/truncation (lossy — not recommended), or
  (c) picking a 1536-dim sentence-transformers model instead (slower, bigger).
Check `supabase/migrations` for any `vector(1536)` column before wiring this
in as a drop-in replacement rather than a new code path.
"""

from __future__ import annotations

import threading
from functools import lru_cache

from sentence_transformers import SentenceTransformer

_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_lock = threading.Lock()


@lru_cache(maxsize=1)
def _get_model() -> SentenceTransformer:
    # Loaded once per process, lazily, so the service boots fast and only
    # pays the model-load cost on first request.
    return SentenceTransformer(_MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts. Truncates each to 2000 chars, same cap embed-text.ts uses."""
    clean = [t.strip()[:2000] for t in texts if t and t.strip()]
    if not clean:
        return []
    with _lock:
        model = _get_model()
        vectors = model.encode(clean, convert_to_numpy=True, show_progress_bar=False)
    return vectors.tolist()


def embedding_dim() -> int:
    with _lock:
        return _get_model().get_sentence_embedding_dimension()
