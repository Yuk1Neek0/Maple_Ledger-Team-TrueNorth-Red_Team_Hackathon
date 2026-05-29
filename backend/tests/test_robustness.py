"""Graceful-degradation / robustness checks (WS1.7).

The primer scores "handle incomplete data without falling over." These assert
the engine returns a well-formed VerificationResult (never raises) on degenerate
inputs: empty store, missing root, a malformed/unparseable entry in the store,
and that schema validation rejects a missing required field as MALFORMED.
"""
import json
from pathlib import Path

from app import adapters
from app.models import Designation
from app.registry import load_registry
from app.verify import verify_root

FIX = Path(__file__).parent / "fixtures"
REGISTRY = load_registry()


def _store(*names):
    store = {}
    for name in names:
        fx = json.loads((FIX / name).read_text(encoding="utf-8"))
        for obj in fx["attestations"]:
            store[adapters.compute_hash(adapters.attestation_from_dict(obj))] = obj
    return store


def test_empty_store_returns_none():
    r = verify_root({}, REGISTRY, "deadbeef")
    assert r.designation == Designation.NONE
    assert r.total_cost_cents == 0
    assert r.cost_by_country == {}


def test_missing_root_returns_none():
    store = _store("happy_path.json")
    r = verify_root(store, REGISTRY, "0" * 64)  # a hash not present in the store
    assert r.designation == Designation.NONE


def test_malformed_entry_is_skipped_not_fatal():
    """An unparseable entry in the shared store must not crash a verify of an
    unrelated, well-formed chain."""
    store = _store("happy_path.json")
    store["junk"] = {"not": "an attestation"}
    fx = json.loads((FIX / "happy_path.json").read_text(encoding="utf-8"))
    r = verify_root(store, REGISTRY, fx["root_hash"])
    assert r.designation == Designation.MADE_IN_CANADA


def test_validate_rejects_missing_required_field():
    fx = json.loads((FIX / "happy_path.json").read_text(encoding="utf-8"))
    obj = dict(fx["attestations"][0])
    obj.pop("materials_cents", None)
    ok, err = adapters.validate(obj)
    assert not ok and "MALFORMED" in (err or "")


def test_validate_tolerates_additive_fields():
    """Schema is extensible (additionalProperties: true) so spec-day additive
    fields (activity, nonce, lot_id, ...) don't break validation (WS4.6)."""
    fx = json.loads((FIX / "happy_path.json").read_text(encoding="utf-8"))
    obj = dict(fx["attestations"][0])
    obj["activity"] = "manufacture"
    obj["nonce"] = "abc123"
    ok, _ = adapters.validate(obj)
    assert ok
