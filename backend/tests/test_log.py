"""Transparency-log HTTP endpoints (P3.1 / P4.1)."""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import main as main_module
from app.main import app
from app.registry import load_registry
from app.storage import open_db

FIX = Path(__file__).parent / "fixtures"

# Hermetic in-memory store per module. The TestClient is constructed directly
# (not via `with`), so the FastAPI lifespan does NOT fire — we hydrate REGISTRY
# and STORE manually to mirror what lifespan would do at startup.
main_module.STORE = open_db(":memory:")
main_module.REGISTRY = load_registry()
client = TestClient(app)


def _seed_happy_path():
    fx = json.loads((FIX / "happy_path.json").read_text(encoding="utf-8"))
    for att in fx["attestations"]:
        client.post("/attestations", json=att)
    return fx


def test_log_head_after_seed():
    _seed_happy_path()
    r = client.get("/log/head").json()
    assert r["head"]["seq"] >= 1
    assert "chain_hash" in r["head"]


def test_log_entry_for_known_hash():
    fx = _seed_happy_path()
    root = fx["root_hash"]
    r = client.get(f"/log/{root}").json()
    assert r["included"] is True
    assert r["entry"]["attestation_hash"] == root


def test_log_entry_404_for_unknown_hash():
    _seed_happy_path()
    r = client.get(f"/log/{'0' * 64}")
    assert r.status_code == 404


def test_health_details_reports_store_count():
    _seed_happy_path()
    r = client.get("/health/details").json()
    assert r["status"] == "ok"
    assert r["store_count"] >= 1
    assert r["registry_count"] >= 4
    assert r["log_head"] is not None


def test_verify_response_includes_log_seq_per_node():
    fx = _seed_happy_path()
    r = client.get(f"/verify/{fx['root_hash']}").json()
    assert "log_head" in r
    nodes_with_log = [n for n in r["graph"]["nodes"] if "log_seq" in n]
    # Every reachable node was POSTed -> every node should be log-anchored.
    assert len(nodes_with_log) == len(r["graph"]["nodes"]) > 0
