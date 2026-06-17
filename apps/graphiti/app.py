"""nazu Graphiti sidecar — a thin FastAPI wrapper over graphiti-core.

The SvelteKit web app owns all configuration (it reads the Anthropic key and
embedder settings from the DB-backed `app_settings`). This service is stateless
about secrets: the web app passes the credential + embedder config on each
request via headers, and we lazily build and cache a Graphiti client keyed by a
hash of that config — rebuilding only when it changes. Host-coupled values
(FalkorDB address, graph name) come from env, mirroring the rest of nazu.

Routes:
  GET  /health    — liveness; reports whether a client has been built.
  POST /episodes  — add_episode(...): extract entities/edges + embed + persist.
  POST /search    — search(query): hybrid semantic + keyword + graph recall.
"""

from __future__ import annotations

import hashlib
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.llm_client.anthropic_client import AnthropicClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.nodes import EpisodeType

# Host-coupled infra (not secrets) — env, with Compose-internal defaults.
FALKORDB_ADDR = os.environ.get("FALKORDB_ADDR", "falkordb:6379")
GRAPH_NAME = os.environ.get("GRAPHITI_GRAPH", "nazu_knowledge")
# Local, OpenAI-compatible embeddings endpoint (e.g. Ollama). Overridable per
# request, but a default keeps a zero-config `docker compose up` working.
DEFAULT_EMBEDDER_BASE_URL = os.environ.get(
    "EMBEDDER_BASE_URL", "http://host.docker.internal:11434/v1"
)
DEFAULT_EMBEDDER_MODEL = os.environ.get("EMBEDDER_MODEL", "nomic-embed-text")
DEFAULT_LLM_MODEL = os.environ.get("GRAPHITI_LLM_MODEL", "claude-haiku-4-5")


class _Cache:
    """Holds one Graphiti client plus the config hash it was built from."""

    key: str | None = None
    client: Graphiti | None = None


_cache = _Cache()


def _config_key(anthropic_key: str, embedder_base_url: str, embedder_model: str) -> str:
    raw = f"{anthropic_key}|{embedder_base_url}|{embedder_model}|{DEFAULT_LLM_MODEL}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def _get_client(
    anthropic_key: str, embedder_base_url: str, embedder_model: str
) -> Graphiti:
    """Return a Graphiti client for this config, rebuilding only when it changes."""
    key = _config_key(anthropic_key, embedder_base_url, embedder_model)
    if _cache.client is not None and _cache.key == key:
        return _cache.client

    if _cache.client is not None:
        await _cache.client.close()

    host, _, port = FALKORDB_ADDR.rpartition(":")
    driver = FalkorDriver(host=host, port=int(port), database=GRAPH_NAME)
    llm = AnthropicClient(config=LLMConfig(api_key=anthropic_key, model=DEFAULT_LLM_MODEL))
    embedder = OpenAIEmbedder(
        config=OpenAIEmbedderConfig(
            # Ollama ignores the key but the OpenAI client requires a non-empty one.
            api_key=os.environ.get("EMBEDDER_API_KEY", "ollama"),
            embedding_model=embedder_model,
            base_url=embedder_base_url,
        )
    )
    client = Graphiti(graph_driver=driver, llm_client=llm, embedder=embedder)
    await client.build_indices_and_constraints()

    _cache.key = key
    _cache.client = client
    return client


def _creds(
    x_anthropic_key: str | None,
    x_embedder_base_url: str | None,
    x_embedder_model: str | None,
) -> tuple[str, str, str]:
    if not x_anthropic_key:
        raise HTTPException(status_code=400, detail="missing X-Anthropic-Key header")
    return (
        x_anthropic_key,
        x_embedder_base_url or DEFAULT_EMBEDDER_BASE_URL,
        x_embedder_model or DEFAULT_EMBEDDER_MODEL,
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    if _cache.client is not None:
        await _cache.client.close()


app = FastAPI(title="nazu-graphiti", version="0.1.0", lifespan=lifespan)


class EpisodeIn(BaseModel):
    content: str = Field(min_length=1)
    name: str
    document_id: str
    source_description: str = "nazu document"
    reference_time: datetime | None = None


class EpisodeOut(BaseModel):
    episode_uuid: str


class SearchIn(BaseModel):
    query: str = Field(min_length=1)
    limit: int = 10


class Fact(BaseModel):
    fact: str
    episode_uuids: list[str]
    score: float | None = None


class SearchOut(BaseModel):
    facts: list[Fact]


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"ok": True, "graph": GRAPH_NAME, "client_ready": _cache.client is not None}


@app.post("/episodes", response_model=EpisodeOut)
async def add_episode(
    body: EpisodeIn,
    x_anthropic_key: str | None = Header(default=None),
    x_embedder_base_url: str | None = Header(default=None),
    x_embedder_model: str | None = Header(default=None),
) -> EpisodeOut:
    client = await _get_client(
        *_creds(x_anthropic_key, x_embedder_base_url, x_embedder_model)
    )
    ref_time = body.reference_time or datetime.now(timezone.utc)
    result = await client.add_episode(
        name=body.name,
        episode_body=body.content,
        source=EpisodeType.text,
        source_description=body.source_description,
        reference_time=ref_time,
    )
    return EpisodeOut(episode_uuid=result.episode.uuid)


@app.post("/search", response_model=SearchOut)
async def search(
    body: SearchIn,
    x_anthropic_key: str | None = Header(default=None),
    x_embedder_base_url: str | None = Header(default=None),
    x_embedder_model: str | None = Header(default=None),
) -> SearchOut:
    client = await _get_client(
        *_creds(x_anthropic_key, x_embedder_base_url, x_embedder_model)
    )
    edges = await client.search(query=body.query, num_results=body.limit)
    facts = [
        Fact(
            fact=e.fact,
            episode_uuids=list(getattr(e, "episodes", []) or []),
            score=getattr(e, "score", None),
        )
        for e in edges
    ]
    return SearchOut(facts=facts)
