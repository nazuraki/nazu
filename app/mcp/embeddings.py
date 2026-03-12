"""Embedding generation via OpenAI API.

Returns np.ndarray ready for pgvector insertion.
Swappable later for Ollama or other providers.
"""

from __future__ import annotations

import numpy as np
from openai import AsyncOpenAI

from app.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def generate_embedding(text: str) -> np.ndarray:
    """Generate an embedding vector for the given text."""
    client = _get_client()
    response = await client.embeddings.create(
        model=settings.embedding_model,
        input=text,
        dimensions=settings.embedding_dimensions,
    )
    return np.array(response.data[0].embedding, dtype=np.float32)
