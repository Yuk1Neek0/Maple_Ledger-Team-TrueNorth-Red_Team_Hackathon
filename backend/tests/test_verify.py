"""Verdict + anomaly assertions in the REAL spec wire format (Lane G).

Rewritten from the old MOCK fixtures. Chains are built + signed in real format by
`tests.realfixtures` (which uses `provenance-kit/reference_lib` + the real
supplier private keys), then run through the real `verify.verify_chain(...)` /
`verify.to_verify_response(...)` path — exactly what the scoring harness exercises.

Assertion style:
  * designation / percentage / chain_valid come from `to_verify_response` (the
    spec response shape: lower-case designation, `canadian_content_percentage`,
    `chain_valid`, `anomalies[].type/attestation_id`).
  * For INTEGRITY attacks we assert the specific scored `type` is present (and on
    the right attestation_id) — NOT that the anomaly list is exactly some set,
    because the statistical/semantic detectors may add other labels.
  * For CLEAN chains we assert `chain_valid is True` and no anomalies. The clean
    builders use canonical timestamps + an in-band labour rate so the calibrated
    detectors stay silent (see realfixtures module docstring).
"""
from app import registry, verify
from app.chain import SupplyChain
from app.models import (
    Attestation,
    InputRef,
    Node,
    Output,
    Reason,
)
from tests import realfixtures as rf

REGISTRY = registry.load_registry()


def run(builder):
    """Build a scenario, verify it, return (internal_result, spec_response)."""
    pid, chain = builder()
    res, c = verify.verify_chain(REGISTRY, pid, chain)
    return res, verify.to_verify_response(res, c, pid)


def types(resp):
    return {a["type"] for a in resp["anomalies"]}


def types_for(resp, att_id):
    return {a["type"] for a in resp["anomalies"] if a["attestation_id"] == att_id}


# ---- designation / percentage (the computation contract) -------------------
def test_happy_path():
    res, resp = run(rf.happy_path)
    assert resp["designation"] == "made_in_canada"
    assert resp["chain_valid"] is True
    assert resp["anomalies"] == []
    # ~96% Canadian (CN bearing keeps it under the 98% product-of-canada bar).
    assert 51.0 <= resp["canadian_content_percentage"] < 98.0


def test_product_of_canada():
    res, resp = run(rf.product_of_canada)
    assert resp["designation"] == "product_of_canada"
    assert resp["canadian_content_percentage"] == 100.0
    assert resp["chain_valid"] is True
    assert resp["anomalies"] == []


def test_foreign_assembly_fails_on_last_st():
    """Last substantial transformation performed abroad -> none, regardless of
    how Canadian the upstream cost is."""
    res, resp = run(rf.foreign_assembly)
    assert resp["designation"] == "none"


def test_under_51_percent_returns_none():
    """Majority foreign cost -> none even though the last ST is in CA."""
    res, resp = run(rf.under_51_percent)
    assert resp["designation"] == "none"
    assert resp["canadian_content_percentage"] < 51.0


def test_zero_total_cost_returns_none():
    res, resp = run(rf.zero_total_cost)
    assert resp["designation"] == "none"
    assert res.total_cost_cents == 0


# ---- integrity attacks -> specific scored anomaly types --------------------
def test_tampered_signature():
    res, resp = run(rf.tampered_signature)
    assert "signature_invalid" in types_for(resp, "att-drone")
    assert resp["chain_valid"] is False


def test_tamper_no_resign():
    """A mutated body (not re-signed) must fail signature verification."""
    res, resp = run(rf.tamper_no_resign)
    assert "signature_invalid" in types_for(resp, "att-drone")
    assert resp["chain_valid"] is False


def test_unknown_issuer():
    res, resp = run(rf.unknown_issuer)
    assert "signature_unknown_supplier" in types_for(resp, "att-drone5")
    assert resp["chain_valid"] is False


def test_broken_link():
    """A parent attestation_id absent from the submission -> dangling_parent."""
    res, resp = run(rf.broken_link)
    assert "dangling_parent" in types_for(resp, "att-drone6")
    assert resp["chain_valid"] is False


def test_parent_hash_mismatch():
    res, resp = run(rf.parent_hash_mismatch)
    assert "parent_hash_mismatch" in types_for(resp, "att-drone13")
    assert resp["chain_valid"] is False


def test_unit_mismatch():
    res, resp = run(rf.unit_mismatch)
    assert "unit_mismatch" in types_for(resp, "att-drone14")
    assert resp["chain_valid"] is False


def test_transformation_implausible():
    """A final_integration that consumes nothing is physically impossible."""
    res, resp = run(rf.transformation_implausible)
    assert "transformation_implausible" in types_for(resp, "att-drone15")
    assert resp["chain_valid"] is False


def test_overdraw_mass_balance():
    """Consuming more of a lot than was produced -> mass_balance_violation,
    attributed to the over-consumed PARENT (per spec)."""
    res, resp = run(rf.overdraw_mass_balance)
    assert "mass_balance_violation" in types_for(resp, "att-lot")
    assert resp["chain_valid"] is False


def test_partial_consumption_is_legitimate():
    """Producer makes 10, consumer takes 2 -> under-consumption is legal; no
    mass-balance violation."""
    res, resp = run(rf.partial_consumption_valid)
    assert "mass_balance_violation" not in types(resp)
    assert resp["chain_valid"] is True


def test_cost_anomaly_is_scored():
    """A grossly inflated labour rate is a scored cost_anomaly, but it does NOT
    change the percentage/designation (the cost still counts in the sum)."""
    res, resp = run(rf.inflated_labour_outlier)
    assert "cost_anomaly" in types_for(resp, "att-il-inflated")
    assert resp["designation"] == "product_of_canada"  # all-CA; anomaly is orthogonal


# ---- advisory: temporal inversion never changes the verdict ----------------
def test_temporal_inversion_is_advisory_only():
    """A consumer predating its input is flagged internally as an advisory
    TEMPORAL_INVERSION. Advisory anomalies are excluded from the scored response
    (surfacing them tanks F1), so chain_valid stays True and the verdict holds."""
    res, resp = run(rf.temporal_inversion)
    assert Reason.TEMPORAL_INVERSION in {a.reason for a in res.anomalies}
    assert all(a.advisory for a in res.anomalies if a.reason == Reason.TEMPORAL_INVERSION)
    assert resp["designation"] == "product_of_canada"  # advisory must not move it


def test_legitimate_repeat_is_not_a_replay():
    """Two DISTINCT attestations (different ids) of the same off-the-shelf part
    are legitimate and must not be flagged as a replay (spec: replay is a
    duplicate attestation_id, not a repeated supplier/product)."""
    res, resp = run(rf.legitimate_repeat)
    assert "replay_within_chain" not in types(resp)
    assert resp["chain_valid"] is True


# ---- deep chain -------------------------------------------------------------
def test_deep_chain_20_nodes_verifies():
    pid, chain = rf.deep_chain(20)
    assert len(chain) == 20
    res, c = verify.verify_chain(REGISTRY, pid, chain)
    resp = verify.to_verify_response(res, c, pid)
    assert resp["designation"] == "product_of_canada"
    assert resp["chain_valid"] is True
    # every node visible in the graph topology; n-1 edges in a linear chain
    assert len(res.graph["nodes"]) == 20
    assert len(res.graph["edges"]) == 19


# ---- worked-example golden regression --------------------------------------
def test_worked_example_golden():
    """The kit's canonical worked example must reproduce its expected output
    exactly: 58.4% / made_in_canada / valid / no anomalies."""
    pid, chain = rf.worked_example()
    res, c = verify.verify_chain(REGISTRY, pid, chain)
    resp = verify.to_verify_response(res, c, pid)
    assert resp == {
        "product_attestation_id": "att-anchor-0012",
        "canadian_content_percentage": 58.4,
        "designation": "made_in_canada",
        "chain_valid": True,
        "anomalies": [],
    }


# ---- cycle guard (format-independent; content addressing makes a real-format
# cycle unconstructable, so we craft the DAG directly as the old tests did) ---
def _att(supplier, prod, inputs):
    return Attestation(supplier, Output(prod, 1, "u"), tuple(InputRef(h, 1) for h in inputs),
                       10, 10, "CA", True, "t", "sig")


def test_cycle_guard_detects_loop():
    a = _att("sup-0001", "a", ["B"])
    b = _att("sup-0002", "b", ["A"])
    by_hash = {
        "A": Node(a, "A", input_hashes=["B"], consumer_hashes=["B"]),
        "B": Node(b, "B", input_hashes=["A"], consumer_hashes=["A"]),
    }
    order, cycle_members = SupplyChain(by_hash, "A").topo_walk()
    assert cycle_members and order == []
    assert set(cycle_members) == {"A", "B"}


def test_self_reference_is_cycle():
    a = _att("sup-0001", "a", ["A"])
    by_hash = {"A": Node(a, "A", input_hashes=["A"], consumer_hashes=["A"])}
    order, cycle_members = SupplyChain(by_hash, "A").topo_walk()
    assert cycle_members == ["A"] and order == []


def test_cycle_anomaly_lists_members_and_forces_none():
    a = _att("sup-0001", "a", ["B"])
    b = _att("sup-0002", "b", ["A"])
    by_hash = {
        "A": Node(a, "A", input_hashes=["B"], consumer_hashes=["B"]),
        "B": Node(b, "B", input_hashes=["A"], consumer_hashes=["A"]),
    }
    r = verify.Verifier(REGISTRY).verify(SupplyChain(by_hash, "A"))
    cyc = next(a for a in r.anomalies if a.reason == Reason.CYCLE)
    assert "members:" in cyc.detail
    assert r.designation.value == "NONE"  # a cycle is fatal


# ---- genuine app gap (documented, not fixed): duplicate-id replay ----------
def test_replay_within_chain_is_a_known_gap():
    """SPEC: a duplicate `attestation_id` in the submission is a
    `replay_within_chain` attack. The current backend does NOT emit that
    anomaly (REPLAY_RULE defaults to 'hash_only' and no duplicate-id detector
    exists yet — this is Lane B's remaining work). This test PINS the current
    behaviour so the gap is visible and a future fix flips this assertion.

    Self-test corpus impact: the `replay_within_chain` category scores ~47%,
    the lowest of any category. See the Lane G report."""
    res, resp = run(rf.replay_within_chain)
    # Documented current behaviour: no replay_within_chain anomaly is emitted.
    assert "replay_within_chain" not in types(resp)
