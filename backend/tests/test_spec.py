"""Adapter swap-harness tests (WS4) in the REAL spec format.

These prove the day-of unknowns are localized behind `spec.py` constants and the
adapter seams: serialization (JCS/DSSE), cost-flow, multi-shape registry, and the
replay-key rule. Chains are built + signed in real format by `tests.realfixtures`.
"""
import json

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app import adapters, content, registry, spec
from app.chain import build_chain
from app.registry import _normalize, load_registry
from tests import realfixtures as rf

_REAL_REG = registry._REAL  # provenance-kit/registry/supplier_public_keys.json


def _build(builder):
    pid, chain = builder()
    atts = [adapters.attestation_from_dict(o) for o in chain]
    root_hash = next(adapters.compute_hash(a) for a in atts if a.attestation_id == pid)
    return build_chain(atts, root_hash)


# ---- serialization seam ----------------------------------------------------
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


# ---- cost-flow seam (real spec = flat "full" sum) --------------------------
def test_cost_flow_full_sanity(monkeypatch):
    """COST_FLOW=full sums each node's own cost once, attributed by its own
    country. happy_path: 500+50+300+300 = 1150 CAD total; CA = 500+300+300 =
    1100 CAD."""
    monkeypatch.setattr(spec, "COST_FLOW", "full")
    chain = _build(rf.happy_path)
    total, canadian, by_country = content.attribute_costs(chain, set(chain.by_hash))
    assert total == 115000 and canadian == 110000
    assert by_country == {"CA": 110000, "CN": 5000}


def test_st_strategy_root(monkeypatch):
    """With ST_STRATEGY=root, the product leaf is always the last ST point."""
    monkeypatch.setattr(spec, "ST_STRATEGY", "root")
    pid, chain = rf.happy_path()
    built = _build(rf.happy_path)
    root_hash = next(adapters.compute_hash(adapters.attestation_from_dict(o))
                     for o in chain if o["attestation_id"] == pid)
    assert adapters.find_last_st(built).hash == root_hash


# ---- registry multi-shape seam --------------------------------------------
def test_real_registry_keys_shape_loads():
    """The real `{version, keys:{id:b64}}` shape normalizes to the internal
    {id:{public_key, verified=True}} map; absence of an id == unknown issuer."""
    reg = load_registry()
    assert len(reg) >= 60
    assert reg["sup-0001"]["verified"] is True
    assert isinstance(reg["sup-0001"]["public_key"], str)  # base64, not hex


def test_registry_accepts_list_shape(tmp_path):
    real = json.loads(_REAL_REG.read_text(encoding="utf-8"))["keys"]
    as_list = [{"issuerId": sid, "publicKey": k, "verified": True}
               for sid, k in list(real.items())[:5]]
    p = tmp_path / "reg_list.json"
    p.write_text(json.dumps(as_list), encoding="utf-8")
    loaded = load_registry(p)
    assert set(loaded) == {e["issuerId"] for e in as_list}
    assert loaded["sup-0001"]["verified"]


def test_registry_accepts_nested_shape(tmp_path):
    real = json.loads(_REAL_REG.read_text(encoding="utf-8"))["keys"]
    nested = {sid: {"public_key": k, "verified": True} for sid, k in list(real.items())[:5]}
    p = tmp_path / "reg_nested.json"
    p.write_text(json.dumps({"issuers": nested}), encoding="utf-8")
    assert set(load_registry(p)) == set(nested)


def test_normalize_camelcase_keys():
    out = _normalize([{"issuerId": "X", "publicKey": "ab", "verified": True}])
    assert out["X"] == {"public_key": "ab", "verified": True}


# ---- replay_key adapter seam (the 7th seam) --------------------------------
def _att_for_replay(supplier_id="sup-0001", product_id="widget"):
    from app.models import Attestation, Output  # noqa: PLC0415
    return Attestation(
        supplier_id=supplier_id, output=Output(product_id, 1, "pcs"),
        inputs=tuple(), materials_cents=0, labour_cents=0,
        work_country="CA", is_substantial_transformation=False,
        timestamp=rf.TS_RAW, signature="",
    )


def test_replay_key_default_is_hash_only():
    """Real spec default: hash_only — the (supplier, product) semantic key is
    DISABLED, because genuine chains legitimately repeat off-the-shelf parts."""
    assert spec.REPLAY_RULE == "hash_only"
    assert adapters.replay_key(_att_for_replay()) is None


def test_replay_key_serial_variant_keys_on_supplier_product(monkeypatch):
    monkeypatch.setattr(spec, "REPLAY_RULE", "serial")
    assert adapters.replay_key(_att_for_replay()) == ("sup-0001", "widget")


def test_replay_key_serial_with_lot_uses_annotation(monkeypatch):
    from app.models import Node  # noqa: PLC0415
    monkeypatch.setattr(spec, "REPLAY_RULE", "serial_with_lot")
    att = _att_for_replay()
    node_no_lot = Node(attestation=att, hash="h")
    assert adapters.replay_key(att, node_no_lot) == ("sup-0001", "widget")
    node_with_lot = Node(attestation=att, hash="h", annotations={"lot_id": "L42"})
    assert adapters.replay_key(att, node_with_lot) == ("sup-0001", "widget", "L42")


def test_hash_only_lets_repeated_offtheshelf_part_pass():
    """Regression: with the default hash_only rule, two distinct attestations of
    the same (supplier, product) must NOT trip REPLAY_DETECTED."""
    from app.models import Reason
    from app.verify import Verifier
    chain = _build(rf.legitimate_repeat)
    r = Verifier(load_registry()).verify(chain)
    assert Reason.REPLAY_DETECTED not in {a.reason for a in r.anomalies}
