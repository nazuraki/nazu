"""Register lightweight stand-ins for graphiti-core so the route-contract tests
run without installing the full library (or a live FalkorDB/LLM). The real
integration is exercised manually via `docker compose up`; these tests only
verify the FastAPI request/response contract and header handling."""

import sys
import types


def _module(name: str) -> types.ModuleType:
    mod = types.ModuleType(name)
    sys.modules[name] = mod
    return mod


def _install_graphiti_stubs() -> None:
    if "graphiti_core" in sys.modules:
        return

    core = _module("graphiti_core")

    class Graphiti:  # noqa: D401 - stub
        def __init__(self, *args, **kwargs): ...
        async def build_indices_and_constraints(self): ...
        async def add_episode(self, *args, **kwargs): ...
        async def search(self, *args, **kwargs): ...
        async def close(self): ...

    core.Graphiti = Graphiti

    driver = _module("graphiti_core.driver")
    falkor = _module("graphiti_core.driver.falkordb_driver")

    class FalkorDriver:
        def __init__(self, *args, **kwargs): ...

    falkor.FalkorDriver = FalkorDriver
    driver.falkordb_driver = falkor

    embedder = _module("graphiti_core.embedder")
    openai_emb = _module("graphiti_core.embedder.openai")

    class OpenAIEmbedder:
        def __init__(self, *args, **kwargs): ...

    class OpenAIEmbedderConfig:
        def __init__(self, *args, **kwargs): ...

    openai_emb.OpenAIEmbedder = OpenAIEmbedder
    openai_emb.OpenAIEmbedderConfig = OpenAIEmbedderConfig
    embedder.openai = openai_emb

    llm = _module("graphiti_core.llm_client")
    anthropic_mod = _module("graphiti_core.llm_client.anthropic_client")
    config_mod = _module("graphiti_core.llm_client.config")

    class AnthropicClient:
        def __init__(self, *args, **kwargs): ...

    class LLMConfig:
        def __init__(self, *args, **kwargs): ...

    anthropic_mod.AnthropicClient = AnthropicClient
    config_mod.LLMConfig = LLMConfig
    llm.anthropic_client = anthropic_mod
    llm.config = config_mod

    nodes = _module("graphiti_core.nodes")

    class EpisodeType:
        text = "text"

    nodes.EpisodeType = EpisodeType


_install_graphiti_stubs()
