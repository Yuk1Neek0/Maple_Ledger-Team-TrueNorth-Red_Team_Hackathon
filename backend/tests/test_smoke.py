"""Foundation smoke tests: app boots, contracts hold, crypto round-trips.

These guard the keystone. The real verdict/anomaly assertions live in the
backend-core stream (test_content.py etc.).
"""
import base64
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import adapters, main as main_module
from app.main import app
from app.registry import load_registry
from app.storage import open_db

FIX = Path(__file__).parent / "fixtures"

# Use an in-memory SQLite store for the smoke suite. Replaces the in-memory dict
# the backend used to have; the TestClient context manager triggers lifespan,
# but we overwrite STORE here so tests are hermetic regardless of file state.
main_module.STORE = open_db(":memory:")

client = TestClient(app)


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_post_returns_content_hash():
    fx = _load("happy_path.json")
    last = None
    for att in fx["attestations"]:
        last = client.post("/attestations", json=att).json()
    # root (drone) is the last posted attestation; its hash must match the fixture
    assert last["hash"] == fx["root_hash"]
    # New (P3.1): a transparency-log seq + chain_hash come back with the hash.
    # Either both are present (first time), or both are None (idempotent re-post).
    assert ("log_seq" in last) and ("chain_hash" in last)


def test_signature_roundtrip_against_registry():
    """Every happy-path signature must verify under its registry key — proves
    canonicalize() + sign + verify agree byte-for-byte."""
    registry = load_registry()
    fx = _load("happy_path.json")
    for obj in fx["attestations"]:
        att = adapters.attestation_from_dict(obj)
        pub, verified = adapters.resolve_key(att.supplier_id, registry)
        assert pub is not None and verified
        msg = adapters.canonicalize(adapters.payload_dict(att))
        sig = base64.b64decode(att.signature)
        assert adapters.verify(msg, sig, pub) is True


def test_tampered_signature_fails():
    registry = load_registry()
    fx = _load("tampered.json")
    # the tampered root must NOT verify
    drone = next(a for a in fx["attestations"] if a["supplier_id"] == "SUP-DRONE")
    att = adapters.attestation_from_dict(drone)
    pub, _ = adapters.resolve_key(att.supplier_id, registry)
    msg = adapters.canonicalize(adapters.payload_dict(att))
    assert adapters.verify(msg, base64.b64decode(att.signature), pub) is False


def test_verify_returns_locked_shape():
    fx = _load("happy_path.json")
    # Ensure the smoke store has the fixture loaded.
    for att in fx["attestations"]:
        client.post("/attestations", json=att)
    r = client.get(f"/verify/{fx['root_hash']}").json()
    # Locked core keys. `log_head` is an additive field present only when the
    # store is SQLite-backed (current default); we tolerate it but don't require
    # it for backwards-compat with legacy dict-store callers.
    required = {
        "designation", "canadian_pct", "total_cost_cents",
        "canadian_cost_cents", "cost_by_country", "anomalies", "graph",
    }
    assert required.issubset(set(r.keys()))
    # graph topology travels with the verdict (WS2.1): nodes + edges present
    assert {"nodes", "edges"}.issubset(set(r["graph"].keys()))
