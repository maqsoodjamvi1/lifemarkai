from fastapi import APIRouter
from pydantic import BaseModel, Field

from core.embedder import embed_texts, embedding_dim

router = APIRouter()


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=256)


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int
    model: str = "sentence-transformers/all-MiniLM-L6-v2"


@router.post("", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    vectors = embed_texts(req.texts)
    return EmbedResponse(embeddings=vectors, dim=embedding_dim())
