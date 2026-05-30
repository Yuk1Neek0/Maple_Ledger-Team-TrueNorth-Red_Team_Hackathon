"""Graceful-degradation / robustness checks (WS1.7).

The primer scores "handle incomplete data without falling over." These assert
the engine returns a well-formed VerificationResult (never raises) on degenerate
inputs: empty store, missing root, and a malformed/unparseable entry mixed into
the store. Stores are built from REAL-format signed chains (`tests.realfixtures`)
keyed by content hash, exactly as `verify_root` expects.

The two `validate(...)` tests exercise the legacy JSON-Schema seam
(`schema/attestation.schema.json`) which still validates the MOCK wire shape; the
scored `/verify` path no longer calls it, but the seam (and its swap-tolerance)
is still live, so we pin its behaviour against a mock-shaped sample.
"""
from app import adapters
from app.models import Designation
from app.registry import load_registry
from app.verify import verify_root
from tests import realfixtures as rf

REGISTRY = load_registry()


def _store(*builders):
    """Content-hash-keyed store of real-format wire dicts (what verify_root reads)."""
    store = {}
    for builder in builders:
        _pid, wire = builder()
        for obj in wire:
            store[rf.content_hash(obj)] = obj
    return store


def _root_hash(builder):
    pid, wire = builder()
    return next(rf.content_hash(o) for o in wire if o["attestation_id"] == pid)


def test_empty_store_returns_none():
    r = verify_root({}, REGISTRY, "deadbeef")
    assert r.designation == Designation.NONE
    assert r.total_cost_cents == 0
    assert r.cost_by_country == {}


def test_missing_root_returns_none():
    store = _store(rf.happy_path)
    r = verify_root(store, REGISTRY, "0" * 64)  # a hash not present in the store
    assert r.designation == Designation.NONE


def test_malformed_entry_is_skipped_not_fatal():
    """An unparseable entry in the shared store must not crash a verify of an
    unrelated, well-formed chain."""
    store = _store(rf.happy_path)
    store["junk"] = {"not": "an attestation"}
    r = verify_root(store, REGISTRY, _root_hash(rf.happy_path))
    assert r.designation == Designation.MADE_IN_CANADA


def test_validate_rejects_missing_required_field():
    """The legacy validate seam rejects a sample missing a mock-required field."""
    obj = {
        "supplier_id": "SUP-ALU",
        "output": {"product_id": "x", "quantity": 1, "unit": "kg"},
        "inputs": [],
        # materials_cents intentionally omitted
        "labour_cents": 10,
        "work_country": "CA",
        "is_substantial_transformation": False,
        "timestamp": "2026-05-01T08:00:00Z",
        "signature": "sig",
    }
    ok, err = adapters.validate(obj)
    assert not ok and "MALFORMED" in (err or "")


def test_validate_tolerates_additive_fields():
    """Schema is extensible (additionalProperties: true) so spec-day additive
    fields (activity, nonce, lot_id, ...) don't break validation (WS4.6)."""
    obj = {
        "supplier_id": "SUP-ALU",
        "output": {"product_id": "x", "quantity": 1, "unit": "kg"},
        "inputs": [],
        "materials_cents": 500,
        "labour_cents": 10,
        "work_country": "CA",
        "is_substantial_transformation": False,
        "timestamp": "2026-05-01T08:00:00Z",
        "signature": "sig",
        "activity": "manufacture",
        "nonce": "abc123",
    }
    ok, _ = adapters.validate(obj)
    assert ok
