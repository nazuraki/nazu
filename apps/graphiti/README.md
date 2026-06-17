# nazu-graphiti

Thin FastAPI sidecar wrapping [`graphiti-core`](https://github.com/getzep/graphiti)
for nazu's temporal-knowledge recall (issue #53). It owns no configuration of
its own: the web app reads the Anthropic key and embedder settings from the
DB-backed `app_settings` and passes them per request via headers. Host-coupled
values (FalkorDB address, graph name) come from env.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness; reports whether a client has been built. |
| `POST` | `/episodes` | `add_episode(...)` — extract entities/edges, embed, persist. |
| `POST` | `/search` | `search(query)` — hybrid semantic + keyword + graph recall. |

Write/recall requests require an `X-Anthropic-Key` header; `X-Embedder-Base-Url`
and `X-Embedder-Model` are optional (env defaults apply).

## Config (env)

| Var | Default | Notes |
|---|---|---|
| `FALKORDB_ADDR` | `falkordb:6379` | Compose-internal FalkorDB. |
| `GRAPHITI_GRAPH` | `nazu_knowledge` | Graph name; distinct from the code-graph `code:*` graphs. |
| `EMBEDDER_BASE_URL` | `http://host.docker.internal:11434/v1` | OpenAI-compatible embeddings endpoint (Ollama). |
| `EMBEDDER_MODEL` | `nomic-embed-text` | Embedding model. |
| `GRAPHITI_LLM_MODEL` | `claude-haiku-4-5` | Anthropic model used for extraction. |

## Tests

Route-contract tests stub `graphiti-core`, so they run without the full library
or a live FalkorDB/LLM:

```sh
just graphiti-test          # from the repo root
# or, in this directory:
pip install -e '.[dev]' && pytest
```

The real Anthropic-extraction + Ollama-embedding + FalkorDB round-trip is
verified manually via `docker compose up`.
