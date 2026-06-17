"""Route-contract tests for the Graphiti sidecar. graphiti-core is stubbed (see
conftest.py); `_get_client` is patched so no real client is built."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app as sidecar

HEADERS = {"X-Anthropic-Key": "sk-test"}


@pytest.fixture
def client(monkeypatch):
    fake = SimpleNamespace(
        add_episode=AsyncMock(
            return_value=SimpleNamespace(episode=SimpleNamespace(uuid="ep-123"))
        ),
        search=AsyncMock(
            return_value=[
                SimpleNamespace(fact="Ada wrote the first algorithm", episodes=["ep-1"], score=0.9),
                SimpleNamespace(fact="No episodes here", episodes=None, score=None),
            ]
        ),
    )
    get_client = AsyncMock(return_value=fake)
    monkeypatch.setattr(sidecar, "_get_client", get_client)
    return TestClient(sidecar.app), fake


def test_health_ok():
    c = TestClient(sidecar.app)
    res = c.get("/health")
    assert res.status_code == 200
    assert res.json()["ok"] is True


def test_add_episode_returns_uuid(client):
    c, fake = client
    res = c.post(
        "/episodes",
        headers=HEADERS,
        json={"content": "Ada Lovelace was a mathematician.", "name": "doc-1", "document_id": "d1"},
    )
    assert res.status_code == 200
    assert res.json() == {"episode_uuid": "ep-123"}
    fake.add_episode.assert_awaited_once()


def test_add_episode_requires_key(client):
    c, _ = client
    res = c.post(
        "/episodes",
        json={"content": "x", "name": "doc-1", "document_id": "d1"},
    )
    assert res.status_code == 400


def test_add_episode_rejects_empty_content(client):
    c, _ = client
    res = c.post(
        "/episodes",
        headers=HEADERS,
        json={"content": "", "name": "doc-1", "document_id": "d1"},
    )
    assert res.status_code == 422


def test_search_maps_edges_to_facts(client):
    c, _ = client
    res = c.post("/search", headers=HEADERS, json={"query": "who wrote the first algorithm"})
    assert res.status_code == 200
    facts = res.json()["facts"]
    assert facts[0] == {
        "fact": "Ada wrote the first algorithm",
        "episode_uuids": ["ep-1"],
        "score": 0.9,
    }
    # Missing/None episodes normalize to an empty list, not null.
    assert facts[1]["episode_uuids"] == []


def test_search_requires_key(client):
    c, _ = client
    res = c.post("/search", json={"query": "x"})
    assert res.status_code == 400
