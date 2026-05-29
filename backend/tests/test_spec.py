"""Adapter swap-harness tests (WS4): the pre-staged variants behind spec.py.

These prove the day-of unknowns are a one-constant flip, not a rewrite:
serialization (JCS/DSSE), cost-flow (fraction/full), and multi-shape registry.
"""
import json
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app import adapters, content, spec
from app.chain import build_chain
from app.registry import _normalize, load_registry

FIX = Path(__file__).parent / "fixtures"
DATA = Path(__file__).resolve().parents[2] / "data"


def test_jcs_is_default():
    assert spec.SERIALIZATION == "jcs"
    assert adapters.canonicalize({"b": 1, "a": 2}) == b'{"a":2,"b":1}'


def test_dsse_pae_roundtrip(monkeypatch):
    monkeypatch.setattr(spec, "SERIALIZATION", "dsse")
    msg = adapters.canonicalize({"b": "x", "a": 1})
    assert msg.startswith(b"DSSEv1 ")
    priv = Ed25519PrivateKey.generate()
    sig = priv.sign(msg)
    assert adapters.verify(msg, sig, priv.public_key()) is True


def test_cost_flow_full_sanity(monkeypatch):
    monkeypatch.setattr(spec, "COST_FLOW", "full")
    fx = json.loads((FIX / "happy_path.json").read_text(encoding="utf-8"))
    atts = [adapters.attestation_from_dict(o) for o in fx["attestations"]]
    chain = build_chain(atts, fx["root_hash"])
    total, canadian, _ = content.attribute_costs(chain, set(chain.by_hash))
    assert total == 1470 and canadian == 1420  # own costs summed once


def test_st_strategy_root(monkeypatch):
    monkeypatch.setattr(spec, "ST_STRATEGY", "root")
    fx = json.loads((FIX / "happy_path.json").read_text(encoding="utf-8"))
    atts = [adapters.attestation_from_dict(o) for o in fx["attestations"]]
    chain = build_chain(atts, fx["root_hash"])
    assert adapters.find_last_st(chain).hash == fx["root_hash"]


def test_registry_accepts_list_shape(tmp_path):
    reg = json.loads((DATA / "registry.json").read_text(encoding="utf-8"))
    as_list = [{"issuerId": sid, "publicKey": e["public_key"], "verified": e["verified"]}
               for sid, e in reg.items()]
    p = tmp_path / "reg_list.json"
    p.write_text(json.dumps(as_list), encoding="utf-8")
    loaded = load_registry(p)
    assert set(loaded) == set(reg) and loaded["SUP-ALU"]["verified"]


def test_registry_accepts_nested_shape(tmp_path):
    reg = json.loads((DATA / "registry.json").read_text(encoding="utf-8"))
    p = tmp_path / "reg_nested.json"
    p.write_text(json.dumps({"issuers": reg}), encoding="utf-8")
    assert set(load_registry(p)) == set(reg)


def test_normalize_camelcase_keys():
    out = _normalize([{"issuerId": "X", "publicKey": "ab", "verified": True}])
    assert out["X"] == {"public_key": "ab", "verified": True}
