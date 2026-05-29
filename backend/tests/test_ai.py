"""Advisory AI endpoints (WS5) — key-optional behaviour.

Forces the no-key path so the suite stays hermetic whether or not
ANTHROPIC_API_KEY is set in the environment, and checks input validation.
"""
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_draft_503_without_key(monkeypatch):
    monkeypatch.setattr("app.llm.available", lambda: False)
    r = client.post("/draft", json={"text": "we milled 50 airframes"})
    assert r.status_code == 503


def test_ask_503_without_key(monkeypatch):
    monkeypatch.setattr("app.llm.available", lambda: False)
    r = client.post("/ask", json={"question": "how canadian?", "root_hash": "abc"})
    assert r.status_code == 503


def test_draft_400_missing_text(monkeypatch):
    monkeypatch.setattr("app.llm.available", lambda: True)  # key present, but no text
    r = client.post("/draft", json={})
    assert r.status_code == 400
