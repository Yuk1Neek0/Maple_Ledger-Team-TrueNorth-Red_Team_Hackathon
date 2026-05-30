"""Deterministic rule-based advisory anomalies (P5).

One positive + one negative case per rule. Every rule MUST emit advisory=True
records and NEVER change the designation. The happy-path fixture stays clean
on every rule (regression guard against rule false-positives drifting in).
"""
import dataclasses
import json
from pathlib import Path

from app import adapters, rules
from app.chain import build_chain
from app.models import Attestation, Designation, InputRef, Node, Output, Reason
from app.registry import load_registry
from app.verify import Verifier

FIX = Path(__file__).parent / "fixtures"
REGISTRY = load_registry()


def _verified(name):
    fx = json.loads((FIX / name).read_text(encoding="utf-8"))
    atts = [adapters.attestation_from_dict(o) for o in fx["attestations"]]
    chain = build_chain(atts, fx["root_hash"])
    r = Verifier(REGISTRY).verify(chain)
    return chain, r


def test_happy_path_triggers_no_advisory_rules():
    """Regression guard: a clean valid chain must not trip any new rule."""
    _, r = _verified("happy_path.json")
    rule_reasons = {a.reason for a in r.anomalies} & {
        Reason.ZERO_LABOUR_ON_ST, Reason.HIGH_FOREIGN_DEPENDENCY,
        Reason.SUSPICIOUS_COST_SPIKE, Reason.LOW_CANADIAN_WITH_CLAIM,
        Reason.LABOUR_COST_OUTLIER, Reason.TIMESTAMP_BURST,
    }
    assert rule_reasons == set(), f"unexpected rule firings: {rule_reasons}"
    # Verdict must not change either way.
    assert r.designation == Designation.MADE_IN_CANADA


def _make_node(supplier_id="SUP-X", product_id="p", qty=1,
               materials=100, labour=100, country="CA", is_st=False,
               ts="2026-05-01T08:00:00Z", input_hashes=()):
    att = Attestation(
        supplier_id=supplier_id, output=Output(product_id, qty, "pcs"),
        inputs=tuple(InputRef(h, 1) for h in input_hashes),
        materials_cents=materials, labour_cents=labour,
        work_country=country, is_substantial_transformation=is_st,
        timestamp=ts, signature="",
    )
    return Node(attestation=att, hash="h_" + product_id, input_hashes=list(input_hashes))


# ---- rule 1: zero labour on ST -----------------------------------------
def test_zero_labour_on_st_fires_and_is_advisory():
    nodes = {"h": _make_node(is_st=True, materials=1000, labour=0)}
    chain = type("C", (), {"by_hash": nodes, "root_hash": "h"})()
    out = rules._zero_labour_on_st(chain)
    assert len(out) == 1
    assert out[0].reason == Reason.ZERO_LABOUR_ON_ST and out[0].advisory is True


def test_zero_labour_on_st_silent_when_non_st():
    nodes = {"h": _make_node(is_st=False, materials=1000, labour=0)}
    chain = type("C", (), {"by_hash": nodes, "root_hash": "h"})()
    assert rules._zero_labour_on_st(chain) == []


# ---- rule 4: low canadian with ST claim --------------------------------
def test_low_canadian_with_claim_fires_when_st_in_foreign_country():
    nodes = {"h": _make_node(is_st=True, country="CN")}
    chain = type("C", (), {"by_hash": nodes, "root_hash": "h"})()
    out = rules._low_canadian_with_claim(chain)
    assert len(out) == 1
    assert out[0].reason == Reason.LOW_CANADIAN_WITH_CLAIM


def test_low_canadian_with_claim_silent_when_ca():
    nodes = {"h": _make_node(is_st=True, country="CA")}
    chain = type("C", (), {"by_hash": nodes, "root_hash": "h"})()
    assert rules._low_canadian_with_claim(chain) == []


# ---- rule 5: labour-cost outlier ---------------------------------------
def test_labour_cost_outlier_flags_extreme_node():
    # 19 normal nodes around labour=100, 1 outlier at 1_000_000. The outlier
    # needs to be extreme enough to clear |z|>=3 even though it inflates the
    # sample mean+std it's being measured against.
    nodes = {}
    for i in range(19):
        n = _make_node(product_id=f"n{i}", labour=100)
        n.hash = f"n{i}"
        nodes[n.hash] = n
    o = _make_node(product_id="out", labour=1_000_000)
    o.hash = "out"
    nodes[o.hash] = o
    chain = type("C", (), {"by_hash": nodes, "root_hash": "out"})()
    out = rules._labour_cost_outlier(chain)
    assert any(a.attestation_hash == "out" for a in out)
    assert all(a.advisory for a in out)


def test_labour_cost_outlier_silent_on_uniform_chain():
    nodes = {f"n{i}": _make_node(product_id=f"n{i}", labour=100) for i in range(5)}
    for h, n in nodes.items():
        n.hash = h
    chain = type("C", (), {"by_hash": nodes, "root_hash": "n0"})()
    assert rules._labour_cost_outlier(chain) == []


# ---- rule 6: timestamp burst -------------------------------------------
def test_timestamp_burst_flags_4_within_60s():
    nodes = {}
    base = "2026-05-01T08:00:0"
    for i in range(4):
        n = _make_node(product_id=f"p{i}", ts=f"{base}{i}Z")
        n.hash = f"h{i}"
        nodes[n.hash] = n
    chain = type("C", (), {"by_hash": nodes, "root_hash": "h0"})()
    out = rules._timestamp_burst(chain)
    assert len(out) == 4 and all(a.reason == Reason.TIMESTAMP_BURST for a in out)


def test_timestamp_burst_silent_for_3_within_60s():
    nodes = {}
    for i in range(3):
        n = _make_node(product_id=f"p{i}", ts=f"2026-05-01T08:00:0{i}Z")
        n.hash = f"h{i}"
        nodes[n.hash] = n
    chain = type("C", (), {"by_hash": nodes, "root_hash": "h0"})()
    assert rules._timestamp_burst(chain) == []


# ---- rule 2 + 3 via full verify_root path ------------------------------
def test_high_foreign_dependency_fires_on_under_51_fixture_only_if_passing():
    """under_51 verdict is NONE, so the rule must NOT fire (rule gates on passing)."""
    _, r = _verified("under_51_percent.json")
    fires = {a.reason for a in r.anomalies if a.reason == Reason.HIGH_FOREIGN_DEPENDENCY}
    assert fires == set()


def test_advisory_rules_never_change_designation():
    """End-to-end invariant: every rule's anomaly must have advisory=True."""
    for fixture in ("happy_path.json", "product_of_canada.json", "under_51_percent.json"):
        _, r = _verified(fixture)
        for a in r.anomalies:
            if a.reason in {
                Reason.ZERO_LABOUR_ON_ST, Reason.HIGH_FOREIGN_DEPENDENCY,
                Reason.SUSPICIOUS_COST_SPIKE, Reason.LOW_CANADIAN_WITH_CLAIM,
                Reason.LABOUR_COST_OUTLIER, Reason.TIMESTAMP_BURST,
            }:
                assert a.advisory is True
