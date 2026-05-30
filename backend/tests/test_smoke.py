"""Foundation smoke tests: app boots, contracts hold, crypto round-trips.

The crypto + scored-path tests use the REAL wire format (`tests.realfixtures`).
The legacy demo routes (`POST /attestations`, `GET /verify/{hash}`) are still
mock-schema bound (their `adapters.validate` checks the mock schema), so the two
tests that exercise those routes keep using the mock `happy_path.json` sample —
that is the format those legacy routes accept.
"""
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app import adapters, main as main_module
from app.main import app
from app.registry import load_registry
from app.storage import open_db
from tests import realfixtures as rf

FIX = Path(__file__).parent / "fixtures"

# Hermetic in-memory store + registry for the smoke suite.
main_module.STORE = open_db(":memory:")
main_module.REGISTRY = load_registry()

client = TestClient(app)


def _load(name):
    return json.loads((FIX / name).read_text(encoding="utf-8"))


def test_health():
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}


def test_post_returns_content_hash():
    """Legacy demo ingest route (mock-schema). The fixture's precomputed
    root_hash must match the last posted attestation's content hash."""
    fx = _load("happy_path.json")
    last = None
    for att in fx["attestations"]:
        last = client.post("/attestations", json=att).json()
    assert last["hash"] == fx["root_hash"]
    assert ("log_seq" in last) and ("chain_hash" in last)


def test_signature_roundtrip_against_registry():
    """Every real-format signature must verify under its registry key via the
    real verification path — proves reference_lib sign + verify_signature agree
    byte-for-byte over the original wire dict."""
    registry = load_registry()
    _pid, chain = rf.happy_path()
    for obj in chain:
        att = adapters.attestation_from_dict(obj)
        pub_b64, verified = adapters.resolve_key(att.supplier_id, registry)
        assert pub_b64 is not None and verified
        assert adapters.verify_signature(att, pub_b64) is True


def test_tampered_signature_fails():
    """A corrupted signature value must NOT verify."""
    registry = load_registry()
    _pid, chain = rf.tampered_signature()
    drone = next(o for o in chain if o["attestation_id"] == "att-drone")
    att = adapters.attestation_from_dict(drone)
    pub_b64, _ = adapters.resolve_key(att.supplier_id, registry)
    assert adapters.verify_signature(att, pub_b64) is False


def test_post_verify_real_contract():
    """The scored route: POST /verify with a real-format chain returns the spec
    response shape with the expected verdict."""
    pid, chain = rf.happy_path()
    r = client.post("/verify", json={"product_attestation_id": pid, "attestations": chain})
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {
        "product_attestation_id", "canadian_content_percentage",
        "designation", "chain_valid", "anomalies",
    }
    assert body["designation"] == "made_in_canada"
    assert body["chain_valid"] is True
    assert body["anomalies"] == []


def test_verify_returns_locked_shape():
    """Legacy demo verify route (GET /verify/{hash}) keeps its locked shape."""
    fx = _load("happy_path.json")
    for att in fx["attestations"]:
        client.post("/attestations", json=att)
    r = client.get(f"/verify/{fx['root_hash']}").json()
    required = {
        "designation", "canadian_pct", "total_cost_cents",
        "canadian_cost_cents", "cost_by_country", "anomalies", "graph",
    }
    assert required.issubset(set(r.keys()))
    assert {"nodes", "edges"}.issubset(set(r["graph"].keys()))
